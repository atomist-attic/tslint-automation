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

import { HandleCommand, logger, Parameter } from "@atomist/automation-client";
import { Parameters } from "@atomist/automation-client/decorators";
import { editorHandler } from "@atomist/automation-client/operations/edit/editorToCommand";
import { failedEdit, ProjectEditor, successfulEdit } from "@atomist/automation-client/operations/edit/projectEditor";
import { Project } from "@atomist/automation-client/project/Project";
import { BranchInRepoParameters } from "../BranchInRepoParameters";

export function addLineIfNotExists(path: string, insert: string): ProjectEditor {
    return (p: Project) =>
        p.findFile(path).then(f => f.getContent().then(fileContents => {
            const trimmedLines = fileContents.split("\n").map(line => line.trim());
            if (!trimmedLines.includes(insert.trim())) {
                return f.setContent(insert + "\n" + fileContents)
                    .then(() => successfulEdit(p, true));
            } else {
                logger.info("file at " + path + " already contains: " + insert);
                return Promise.resolve(successfulEdit(p, false));
            }
        })).catch(error => failedEdit(p, error));
}

@Parameters()
export class InsertLineIfNotExistsParameters {
    @Parameter()
    public path: string;

    @Parameter()
    public insert: string;

    @Parameter()
    public message: string;

    public targets: BranchInRepoParameters = new BranchInRepoParameters();
}

export function insertLineIfNotExistsCommand(): HandleCommand {
    return editorHandler<InsertLineIfNotExistsParameters>(params => addLineIfNotExists(params.path, params.insert),
        InsertLineIfNotExistsParameters,
        "InsertLineIfNotExists", {
            editMode: p => ({
                branch: p.targets.sha,
                message: p.message,
            }),
            intent: "insert line",
        });
}
