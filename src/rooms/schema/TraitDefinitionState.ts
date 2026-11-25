import { ArraySchema, Schema, type } from "@colyseus/schema";

export class TraitDefinitionState extends Schema {
    @type("string") id = "";
    @type("string") title = "";
    @type("string") description = "";
    @type("uint8") maxRank = 1;
    @type(["string"]) rankDescriptions = new ArraySchema<string>();
}
