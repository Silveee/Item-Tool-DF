import { AggregationCursor, Collection as MongoCollection, Db } from 'mongodb';
import config from '../../config';
import { dbConnection } from '../../dbConnection';
import { capitalize } from '../../utils/misc';
import { getSortQueryPipeline } from './queryBuilder';
import { SortableItemType, SortFilterParams } from './types';
import { unaliasBonusName } from './sortExpressionParser';
import {
    MessageActionRowComponentResolvable,
    MessageActionRowOptions,
    MessageOptions,
    MessageSelectOptionData,
} from 'discord.js';
import { INTERACTION_ID_ARG_SEPARATOR, MAX_EMBED_DESC_LENGTH } from '../../utils/constants';
import { ItemTag, PRETTY_TAG_NAMES } from '../../utils/itemTypeData';
import {
    ITEM_TAG_FILTER_OPTION_NAMES,
    PRETTY_ITEM_TYPES,
    QUERY_RESULT_LIMIT,
    SORTABLE_TAGS,
    SORT_ACTIONS,
} from './constants';

const ITEM_LIST_DELIMITER = ', `';
const itemCollection: Promise<MongoCollection> = dbConnection.then((db: Db) =>
    db.collection(config.DB_COLLECTION)
);

function getFiltersUsedText({
    ascending,
    weaponElement,
    minLevel,
    maxLevel,
}: Partial<SortFilterParams>): string {
    const filterText: string[] = [];
    if (weaponElement) filterText.push(`**Weapon Element:** ${capitalize(weaponElement)}`);

    const levelFilterText: string[] = [];
    if (ascending) filterText.push('**Order:** Ascending');
    if (minLevel !== undefined && minLevel !== 0) {
        levelFilterText.push(`**Min level:** ${minLevel}`);
    }
    if (maxLevel !== undefined && maxLevel !== 90) {
        levelFilterText.push(`**Max level:** ${maxLevel}`);
    }
    if (levelFilterText.length) filterText.push(levelFilterText.join(', '));

    return filterText.join('\n');
}

function getNavigationComponents(
    prevPageValueLimit?: number | undefined,
    nextPageValueLimit?: number | undefined,
    excludeTags?: Set<ItemTag>
): MessageActionRowOptions[] {
    const excludeTagsList: string = (excludeTags ? [...excludeTags] : []).join(',');
    const selectMenuComponent: MessageActionRowComponentResolvable[] = [
        {
            customId: SORT_ACTIONS.TAG_SELECTION,
            placeholder: 'All tags included',
            minValues: 0,
            maxValues: SORTABLE_TAGS.length - 1,
            type: 'SELECT_MENU',
            options: SORTABLE_TAGS.map(
                (tag: ItemTag): MessageSelectOptionData => ({
                    label: 'Exclude ' + PRETTY_TAG_NAMES[tag],
                    value: tag,
                    default: excludeTags && excludeTags.has(tag),
                })
            ),
        },
    ];

    const buttonComponents: MessageActionRowComponentResolvable[] = [];
    if (prevPageValueLimit !== undefined) {
        buttonComponents.push({
            type: 'BUTTON',
            label: '\u276e Prev Page',
            customId: [SORT_ACTIONS.PREV_PAGE, prevPageValueLimit, excludeTagsList].join(
                INTERACTION_ID_ARG_SEPARATOR
            ),
            style: 'PRIMARY',
        });
    }
    if (nextPageValueLimit !== undefined) {
        buttonComponents.push({
            type: 'BUTTON',
            label: 'Next Page \u276f',
            customId: [SORT_ACTIONS.NEXT_PAGE, nextPageValueLimit, excludeTagsList].join(
                INTERACTION_ID_ARG_SEPARATOR
            ),
            style: 'PRIMARY',
        });
    }

    if (!buttonComponents.length) return [{ type: 'ACTION_ROW', components: selectMenuComponent }];

    return [
        { type: 'ACTION_ROW', components: selectMenuComponent },
        { type: 'ACTION_ROW', components: buttonComponents },
    ];
}

export function multiItemDisplayMessage(
    itemTypes: SortableItemType[],
    sortFilterParams: Omit<SortFilterParams, 'itemType'>
): Pick<MessageOptions, 'embeds' | 'components'> {
    return {
        embeds: [
            {
                title: `Sort items by ${sortFilterParams.sortExpression.pretty}`,
                description: `${getFiltersUsedText(
                    sortFilterParams
                )}\n\nClick on one of the buttons below`,
            },
        ],

        // Display item types after the 5th in a separate action row, since a single action row can only contain 5 buttons
        components: [itemTypes.slice(0, 5), itemTypes.slice(5)].map(
            (itemTypeSubset: SortableItemType[]) => ({
                type: 'ACTION_ROW',
                components: itemTypeSubset.map(
                    (itemType: SortableItemType): MessageActionRowComponentResolvable => ({
                        type: 'BUTTON',
                        label: capitalize(itemType),
                        customId: 'show-sort-results' + INTERACTION_ID_ARG_SEPARATOR + itemType,
                        style: 'PRIMARY',
                    })
                ),
            })
        ),
    };
}

export default async function getSortedItemList(
    sortFilterParams: SortFilterParams
): Promise<Pick<MessageOptions, 'embeds' | 'components'>> {
    if (sortFilterParams.weaponElement) {
        sortFilterParams.weaponElement = unaliasBonusName(sortFilterParams.weaponElement);
    }

    const pipeline = getSortQueryPipeline(sortFilterParams);
    const sortResults: AggregationCursor = (await itemCollection).aggregate(pipeline);

    let itemGroup: {
        customSortValue: number;
        items: { title: string; levels: string[]; tagSet: { tags: string[] }[] }[];
    } | null = null;
    let sortedList: string = '';
    let lastResult: string = '';
    let groupCount: number = 0;
    let firstGroupValue: number | undefined;
    let lastGroupValue: number | undefined;

    itemGroup = await sortResults.next();
    firstGroupValue = itemGroup?.customSortValue;

    // Keep populating results until itemGroups have been exhausted, or
    // if the number of read groups is less than or equal to 1 less than the query result limit
    // We stop at 1 less than the result limit to prevent the 'more results' button from
    // being redundant
    while (itemGroup !== null && groupCount < QUERY_RESULT_LIMIT - 1) {
        groupCount += 1;

        let items: {
            title: string;
            levels: string[];
            tagSet: { tags: string[] }[];
        }[] = itemGroup.items;

        // Format and concatenate items in the itemGroup
        const itemDisplayList: string[] = items.map((item) => {
            let possibleTags: string = item.tagSet
                .map(({ tags }) => (tags.length ? tags.map(capitalize).join('+') : 'None'))
                .join(' / ');
            possibleTags = possibleTags === 'None' ? '' : `[${possibleTags}]`;
            return `\`${item.title}\` (lv. ${item.levels.join(', ')}) ${possibleTags}`.trim();
        });

        // Store the last formatted result
        const sign: string = itemGroup.customSortValue < 0 ? '' : '+';
        lastResult = `**${sign}${itemGroup.customSortValue}**\n ${itemDisplayList.join(', ')}\n\n`;

        // Stop populating results if including lastResult will exceed the embed character limit
        if (lastResult.length + sortedList.length > MAX_EMBED_DESC_LENGTH) {
            break;
        }

        if (sortFilterParams.prevPageValueLimit) sortedList = lastResult + sortedList;
        else sortedList += lastResult;

        lastGroupValue = itemGroup.customSortValue;
        itemGroup = await sortResults.next();
    }
    if (lastGroupValue === undefined) lastGroupValue = itemGroup?.customSortValue;

    if (sortFilterParams.prevPageValueLimit) {
        [lastGroupValue, firstGroupValue] = [firstGroupValue, lastGroupValue];
    }

    // Handle case in which the first itemGroup fetched exceeds the embed's character limit
    // In this case, display as many items as possible and append ellipses '...'
    if (!sortedList && lastResult) {
        const ellipses = ' **...**';
        const lastItemIndexBeforeLimit: number = lastResult
            .slice(0, MAX_EMBED_DESC_LENGTH - ellipses.length)
            .lastIndexOf(ITEM_LIST_DELIMITER);
        if (lastItemIndexBeforeLimit !== -1)
            sortedList = lastResult.slice(0, lastItemIndexBeforeLimit) + ellipses;
    }

    const buttonRow: MessageActionRowOptions[] = getNavigationComponents(
        // Add a previous page button to the message if any of the following are true:
        // 1) The next page value limit parameter exists, implying that they clicked "next page" at least once
        // 2) The previous page value limit exists (implying that the user clicked on "prev page" at least once),
        //    and not all itemGroups were exhausted (can be checked by seeing if itemGroup is non null)
        sortFilterParams.nextPageValueLimit !== undefined ||
            (sortFilterParams.prevPageValueLimit !== undefined && !!itemGroup)
            ? firstGroupValue
            : undefined,
        // Add a next page button to the message if the following are true:
        // 1) The prev page value limit parameter exists, implying that they clicked "prev page" at least once
        // 2) Both prev and next page value limits don't exist (implying that neither "prev page" nor "next page"
        //    were clicked), and not all itemGroups were exhausted (itemGroup is not null)
        // 3) The next page value limit exists (implying that the user clicked on "next page" at least once),
        //    and not all itemGroups were exhausted (can be checked by seeing if itemGroup is non null)
        sortFilterParams.prevPageValueLimit !== undefined ||
            (sortFilterParams.prevPageValueLimit === undefined &&
                sortFilterParams.nextPageValueLimit === undefined &&
                !!itemGroup) ||
            (sortFilterParams.nextPageValueLimit !== undefined && !!itemGroup)
            ? lastGroupValue
            : undefined,
        sortFilterParams.excludeTags
    );

    sortedList = sortedList || 'No results were found';

    // Pretty print the input item type
    const title: string = `Sort ${PRETTY_ITEM_TYPES[sortFilterParams.itemType]} by ${
        sortFilterParams.sortExpression.pretty
    }`;

    // Display filters used in the first embed
    const filters: string = getFiltersUsedText(sortFilterParams);

    return {
        embeds: [{ title, description: filters }, { description: sortedList }],
        components: buttonRow,
    };
}
