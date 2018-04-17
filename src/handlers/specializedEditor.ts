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

import { HandleCommand, Parameter } from "@atomist/automation-client";
import { Parameters } from "@atomist/automation-client/decorators";
import { editorHandler } from "@atomist/automation-client/operations/edit/editorToCommand";
import { EditResult, ProjectEditor } from "@atomist/automation-client/operations/edit/projectEditor";
import { Project } from "@atomist/automation-client/project/Project";
import { addLineIfNotExists } from "./BittyEditors/AddLineIfNotExists";
import { replaceLineInFile } from "./BittyEditors/ReplaceLine";
import { BranchInRepoParameters } from "./BranchInRepoParameters";

@Parameters()
export class RemoveConsoleLogParameters {
    @Parameter()
    public lineFrom1: number;

    @Parameter()
    public path: string;

    @Parameter()
    public previousContent: string;

    @Parameter()
    public message: string;

    public targets: BranchInRepoParameters = new BranchInRepoParameters();
}

export const ReplaceConsoleLogWithLogger = "ReplaceConsoleLogWithLogger";

export function replaceConsoleLogWithLoggerCommand(): HandleCommand {
    return editorHandler<RemoveConsoleLogParameters>(replaceConsoleLogWithLogger,
        RemoveConsoleLogParameters,
        ReplaceConsoleLogWithLogger,
        {
            editMode: p => ({
                branch: p.targets.sha,
                message: p.message,
            }),
        });
}

function replaceConsoleLogWithLogger(params: RemoveConsoleLogParameters): ProjectEditor {
    // tslint:disable-next-line:non-arrow-functions
    // tslint:disable-next-line:only-arrow-functions
    return async function(p: Project) {
        const newContent = params.previousContent.replace("console.log", "logger.info");
        const result1: EditResult = await replaceLineInFile(params.path, params.lineFrom1, params.previousContent, newContent)(p, undefined);
        if (result1.success && result1.edited) {
            const result2: EditResult = await addLineIfNotExists(params.path,
                "import { logger } from \"@atomist/automation-client\";")(p, undefined);
            return combineEditResults(result1, result2);
        }
        return result1;
    };
}

function combineEditResults(result1: EditResult, result2: EditResult): EditResult {
    if (result2.success && !result2.edited) {
        return result1;
    }
    return result2;
}
