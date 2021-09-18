import { ItemTypes } from '../../commonTypes/items';
import {
    ItemTypeMongoFilter,
    QUERY_RESULT_LIMIT,
    SortableItemType,
    SortFilterParams,
} from './types';

function getItemTypeFilter(itemType: SortableItemType): ItemTypeMongoFilter {
    if (itemType === ItemTypes.WEAPON) return { category: 'weapon' };
    if (itemType === ItemTypes.CAPE)
        return { category: 'accessory', type: { $in: [ItemTypes.CAPE, ItemTypes.WINGS] } };
    return {
        category: 'accessory',
        type: itemType,
    };
}

export function getSortQueryPipeline({
    itemType,
    ascending,
    sortExpression,
    weaponElement,
    minLevel,
    maxLevel,
    nextPageValueLimit,
    prevPageValueLimit,
}: SortFilterParams): Object[] {
    const filter: { [filterName: string]: any } = {
        customSortValue: { $exists: true, $ne: 0 },
        ...getItemTypeFilter(itemType),
        $nor: [
            { 'tagSet.tags': 'ak' },
            { 'tagSet.tags': 'alexander' },
            { 'tagSet.tags': { $all: ['temp', 'default'] } },
            { 'tagSet.tags': { $all: ['temp', 'rare'] } },
        ],
        ...(weaponElement ? { elements: weaponElement } : {}),
    };
    if (minLevel !== undefined || maxLevel !== undefined) {
        filter.level = {
            ...(minLevel !== undefined ? { $gte: minLevel } : {}),
            ...(maxLevel !== undefined ? { $lte: maxLevel } : {}),
        };
    }
    if (nextPageValueLimit !== undefined) {
        if (ascending) filter.customSortValue.$gt = nextPageValueLimit;
        else filter.customSortValue.$lt = nextPageValueLimit;
    } else if (prevPageValueLimit !== undefined) {
        if (ascending) filter.customSortValue.$lt = prevPageValueLimit;
        else filter.customSortValue.$gt = prevPageValueLimit;
    }

    const sortOrder: 1 | -1 =
        (ascending && !prevPageValueLimit) || (!ascending && prevPageValueLimit) ? 1 : -1;

    return [
        {
            $addFields: {
                damage: { $avg: '$damage' },
                bonuses: { $arrayToObject: '$bonuses' },
                resists: { $arrayToObject: '$resists' },
            },
        },
        { $addFields: { customSortValue: sortExpression.mongo } },
        { $match: filter },
        // { $sort: { customSortValue: sortOrder, level: -1 } },
        // Group documents that belong to the same family
        // {
        //     $group: {
        //         _id: { family: '$family' },
        //         doc: { $first: '$$CURRENT' },
        //     }
        // },
        // { $sort: { 'doc.customSortValue': sortOrder, 'doc.level': -1 } },
        // { $replaceRoot: { newRoot: '$doc' } },
        // Group documents
        {
            $group: {
                _id: {
                    customSortValue: '$customSortValue',
                    title: '$title',
                    tagSet: '$tagSet',
                },
                levels: { $push: '$level' },
            },
        },
        { $sort: { '_id.title': 1 } },
        {
            $group: {
                _id: { customSortValue: '$_id.customSortValue' },
                items: {
                    $push: {
                        title: '$_id.title',
                        levels: '$levels',
                        tagSet: '$_id.tagSet',
                    },
                },
            },
        },
        { $addFields: { customSortValue: '$_id.customSortValue' } },
        { $sort: { customSortValue: sortOrder } },
        { $limit: QUERY_RESULT_LIMIT },
    ];
}
