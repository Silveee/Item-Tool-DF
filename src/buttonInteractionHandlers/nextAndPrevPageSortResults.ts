import { ButtonInteraction, Message, MessageOptions } from 'discord.js';
import { ActionRowInteractionData } from '../eventHandlerTypes';
import { SORT_ACTIONS } from '../interactionLogic/sort/constants';
import getSortedItemList from '../interactionLogic/sort/getSortedItems';
import { getFiltersFromEmbed } from '../interactionLogic/sort/queryBuilder';
import { SortFilterParams } from '../interactionLogic/sort/types';
import { ItemTag } from '../utils/itemTypeData';

const buttonInteration: ActionRowInteractionData = {
    // previous page sort results, next page sort results
    names: [SORT_ACTIONS.PREV_PAGE, SORT_ACTIONS.NEXT_PAGE],
    preferEphemeralErrorMessage: true,
    run: async (
        interaction: ButtonInteraction,
        args: string[],
        handlerName: SORT_ACTIONS
    ): Promise<void> => {
        const [valueLimit, excludedTagList]: string[] = args;
        const excludedTags: string[] = excludedTagList.split(',');
        const usedFilters: SortFilterParams = getFiltersFromEmbed(
            interaction.message.embeds[0].title!,
            interaction.message.embeds[0].description ?? undefined,
            excludedTags as ItemTag[]
        );
        if (handlerName === SORT_ACTIONS.NEXT_PAGE) {
            usedFilters.nextPageValueLimit = Number(valueLimit);
        } else {
            usedFilters.prevPageValueLimit = Number(valueLimit);
        }

        const sortedItems: MessageOptions = await getSortedItemList(usedFilters);
        if (interaction.message instanceof Message && interaction.message.flags?.has('EPHEMERAL')) {
            await interaction.update(sortedItems);
        } else {
            await interaction.reply({ ...sortedItems, ephemeral: true });
        }
    },
};

export default buttonInteration;
