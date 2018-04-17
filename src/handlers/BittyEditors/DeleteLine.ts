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
import { failedEdit, ProjectEditor, successfulEdit } from "@atomist/automation-client/operations/edit/projectEditor";
import { Project } from "@atomist/automation-client/project/Project";
import { BranchInRepoParameters } from "../BranchInRepoParameters";

function deleteLine(path: string, lineFrom1: number, previousContent: string): ProjectEditor {
    return (p: Project) =>
        p.findFile(path).then(f => f.getContent().then(fileContents => {
            const currentContent = getLine(fileContents, lineFrom1);
            if (currentContent.trim() === currentContent.trim()) {
                const whitespace = previousContent.match(/^\s*/);
                return f.setContent(deleteOneLine(fileContents, lineFrom1))
                    .then(() => successfulEdit(p, true));
            } else {
                return Promise.resolve(failedEdit(p,
                    new Error("The content at line " + lineFrom1 + " did not match " + previousContent)));
            }
        })).catch(error => failedEdit(p, error));
}

function deleteOneLine(previousLines: string, lineFrom1: number): string {
    const lines = previousLines.split("\n");
    if (lines.length < lineFrom1) {
        return `## oops, there are only ${lines.length} lines. Unable to delete line ${lineFrom1}`;
    }
    const before = lines.slice(0, lineFrom1 - 1);
    const after = lines.slice(lineFrom1);
    return before.concat(after).join("\n");
}

function getLine(content: string, lineFrom1: number) {
    const lines = content.split("\n");
    if (lines.length < lineFrom1) {
        return `## oops, there are only ${lines.length} lines. Unable to retrieve line ${lineFrom1}`;
    }
    return lines[lineFrom1 - 1];
}

@Parameters()
export class DeleteLineParameters {
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

export function deleteLineCommand(): HandleCommand {
    return editorHandler<DeleteLineParameters>(params => deleteLine(params.path,
        params.lineFrom1, params.previousContent), DeleteLineParameters,
        "DeleteLine", {
            editMode: p => ({
                branch: p.targets.sha,
                message: p.message,
            }),
            intent: "delete line",
        });
}
