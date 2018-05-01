/*
 * Copyright © 2018 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Configuration } from "@atomist/automation-client";
import { deleteLineCommand } from "./handlers/BittyEditors/DeleteLine";
import { insertAboveLineCommand } from "./handlers/BittyEditors/InsertAboveLine";
import { replaceLineCommand } from "./handlers/BittyEditors/ReplaceLine";
import { reportConfigurationCommand } from "./handlers/Configuration/ReportConfiguration";
import { DoOfferToHelp, StopBotheringMe } from "./handlers/Configuration/SelfConfigurate";
import { HelloAutomation } from "./handlers/HelloAutomation";
import { PleaseLint, PushToTsLinting } from "./handlers/PushToTsLinting";
import { replaceConsoleLogWithLoggerCommand } from "./handlers/specializedEditor";
import { UpdateMessageOnBuild } from "./handlers/UpdateMessageOnBuild";
import { configureLogzio } from "./util/logzio";

export const configuration: Configuration = {
    commands: [
        HelloAutomation,
        StopBotheringMe,
        DoOfferToHelp,
        PleaseLint,
        insertAboveLineCommand,
        replaceLineCommand,
        deleteLineCommand,
        replaceConsoleLogWithLoggerCommand,
        () => reportConfigurationCommand,
    ],
    events: [
        PushToTsLinting,
        UpdateMessageOnBuild,
    ],
    postProcessors: [configureLogzio],
};
