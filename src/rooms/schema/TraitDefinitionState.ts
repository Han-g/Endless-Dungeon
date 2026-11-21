import { Schema, type } from "@colyseus/schema";

export class TraitDefinitionState extends Schema {
    @type("string") id = "";
    @type("string") title = "";
    @type("string") description = "";
}
