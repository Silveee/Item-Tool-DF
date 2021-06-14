import { Collection } from 'discord.js';
import { ButtonInteractionData } from '../commonTypes/commandStructures';
import sortItemButtonInteraction from '../buttonInteractions/sort';

const buttonInteractionHandlers: Collection<string, ButtonInteractionData> = new Collection();

const buttonInteractionHandlerList: ButtonInteractionData[] = [sortItemButtonInteraction];
for (const buttonInteractionHandler of buttonInteractionHandlerList) {
    for (const interactionName of buttonInteractionHandler.names) {
        buttonInteractionHandlers.set(interactionName, buttonInteractionHandler);
    }
}
console.log('Button interaction handlers have been loaded');

export default buttonInteractionHandlers;