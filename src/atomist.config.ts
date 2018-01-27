import { Configuration } from "@atomist/automation-client/configuration";
import * as appRoot from "app-root-path";
import { adminCreds } from "./credentials";
import { deleteLineCommand } from "./handlers/BittyEditors/DeleteLine";
import { insertAboveLineCommand } from "./handlers/BittyEditors/InsertAboveLine";
import { replaceLineCommand } from "./handlers/BittyEditors/ReplaceLine";
import { DeployAfterSuccessfulBuild, deployCommand } from "./handlers/DeploySelf";
import { HelloWorld } from "./handlers/HelloWorld";
import { PleaseLint, PushToTsLinting } from "./handlers/PushToTsLinting";
import { StopBotheringMe } from "./handlers/SelfConfigurate";
import { replaceConsoleLogWithLoggerCommand } from "./handlers/specializedEditor";
import { sshCommand } from "./handlers/Ssh";
import { UpdateMessageOnBuild } from "./handlers/UpdateMessageOnBuild";

// tslint:disable-next-line:no-var-requires
const pj = require(`${appRoot}/package.json`);

const AtomistCommunity = "T29E48P34";
const teamIds = [AtomistCommunity];

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
       // () => sshCommand(),
        () => deleteLineCommand(),
        () => replaceConsoleLogWithLoggerCommand(),
    ],
    events: [
        () => new PushToTsLinting(),
        DeployAfterSuccessfulBuild,
        UpdateMessageOnBuild,
    ],
    token: adminCreds.token,
    applicationEvents: {
        teamId: AtomistCommunity,
        enabled: true,
    },
    http: { enabled: false },
};
