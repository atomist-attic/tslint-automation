import { logger } from "@atomist/automation-client";
import { Configuration } from "@atomist/automation-client/configuration";
import * as appRoot from "app-root-path";
import { DeployAfterSuccessfulBuild, deployCommand } from "./handlers/DeploySelf";
import { HelloWorld } from "./handlers/HelloWorld";
import { insertAboveLineCommand } from "./handlers/InsertAboveLine";
import { PleaseLint, PushToTsLinting } from "./handlers/PushToTsLinting";
import { replaceLineCommand } from "./handlers/ReplaceLine";
import { StopBotheringMe } from "./handlers/SelfConfigurate";
import { UpdateMessageOnBuild } from "./handlers/UpdateMessageOnBuild";
import { adminCreds } from "./credentials";
import { sshCommand } from "./handlers/Ssh";

// tslint:disable-next-line:no-var-requires
const pj = require(`${appRoot}/package.json`);



const teamIds = ["T29E48P34"];

export const configuration: Configuration = {
    name: pj.name,
    version: pj.version,
    teamIds,
    commands: [
        HelloWorld,
        StopBotheringMe,
        PleaseLint,
        () => insertAboveLineCommand(),
        () => replaceLineCommand(),
        () => deployCommand(),
        () => sshCommand(),
    ],
    events: [
        () => new PushToTsLinting(),
        DeployAfterSuccessfulBuild,
        UpdateMessageOnBuild,
    ],
    token: adminCreds.token,
    http: {
        enabled: true,
        auth: {
            basic: {
                enabled: false,
            },
            bearer: {
                enabled: false,
            },
        },
    },
};
