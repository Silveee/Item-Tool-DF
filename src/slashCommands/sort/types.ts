import { ItemType } from '../../types/items';

export enum SortSubCommand {
    ALL = 'all-items',
    WEAPON = 'weapon',
    CAPE = 'cape',
    HELM = 'helm',
    BELT = 'belt',
    NECKLACE = 'necklace',
    RING = 'ring',
    TRINKET = 'trinket',
    BRACER = 'bracer',
}

export enum SortCommandParams {
    SORT_EXPRESSION = 'sort-expression',
    MIN_LEVEL = 'min-level',
    MAX_LEVEL = 'max-level',
    WEAPON_ELEMENT = 'weapon-element',
}

export type SortableItemType = Exclude<SortSubCommand, SortSubCommand.ALL>;

export interface MongoSortExpression {
    [operator: string]: (number | string | boolean | MongoSortExpression)[];
}

export interface SortExpressionData {
    baseExpression: string;
    pretty: string;
    mongo: MongoSortExpression;
}

export interface ItemTypeMongoFilter {
    category?: string;
    type?: ItemType | { $in: ItemType[] };
}

export interface SortFilterParams {
    sortExpression: SortExpressionData;
    weaponElement?: string;
    minLevel?: number;
    maxLevel?: number;
}