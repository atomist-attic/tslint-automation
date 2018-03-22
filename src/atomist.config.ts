import { Configuration } from "@atomist/automation-client";
import { deleteLineCommand } from "./handlers/BittyEditors/DeleteLine";
import { insertAboveLineCommand } from "./handlers/BittyEditors/InsertAboveLine";
import { replaceLineCommand } from "./handlers/BittyEditors/ReplaceLine";
import { reportConfigurationCommand } from "./handlers/Configuration/ReportConfiguration";
import { DoOfferToHelp, StopBotheringMe } from "./handlers/Configuration/SelfConfigurate";
import { HelloWorld } from "./handlers/HelloWorld";
import { PleaseLint, PushToTsLinting } from "./handlers/PushToTsLinting";
import { replaceConsoleLogWithLoggerCommand } from "./handlers/specializedEditor";
// import { sshCommand } from "./handlers/Ssh";
import { UpdateMessageOnBuild } from "./handlers/UpdateMessageOnBuild";
import { configureLogzio } from "./util/logzio";

export const configuration: Configuration = {
    commands: [
        HelloWorld,
        StopBotheringMe,
        DoOfferToHelp,
        PleaseLint,
        () => insertAboveLineCommand(),
        () => replaceLineCommand(),
        // () => sshCommand(),
        () => deleteLineCommand(),
        () => replaceConsoleLogWithLoggerCommand(),
        () => reportConfigurationCommand,
    ],
    events: [
        () => new PushToTsLinting(),
        UpdateMessageOnBuild,
    ],
    postProcessors: [configureLogzio],
};
