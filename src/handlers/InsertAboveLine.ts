import { failedEdit, ProjectEditor, successfulEdit } from "@atomist/automation-client/operations/edit/projectEditor";
import { Project } from "@atomist/automation-client/project/Project";
import { editorHandler } from "@atomist/automation-client/operations/edit/editorToCommand";
import { Parameters } from "@atomist/automation-client/decorators";
import { HandleCommand, Parameter } from "@atomist/automation-client";
import { BranchInRepoParameters } from "./PushToTsLinting";

function insertAboveLine(path: string, lineFrom1: number, previousContent: string, insert: string): ProjectEditor {
    return (p: Project) =>
        p.findFile(path).then(f => f.getContent().then(fileContents => {
            const currentContent = getLine(fileContents, lineFrom1);
            if (currentContent === previousContent) {
                return f.setContent(insertBefore(fileContents, lineFrom1, insert)).then(() => successfulEdit(p, true));
            } else {
                return Promise.resolve(failedEdit(p,
                    new Error("The content at line " + lineFrom1 + " did not match " + previousContent)));
            }
        })).catch(error => failedEdit(p, error));
}

function insertBefore(previousLines: string, lineFrom1: number, newLine: string): string {
    const lines = previousLines.split("\n");
    if (lines.length < lineFrom1) {
        return `## oops, there are only ${lines.length} lines. Unable to insert before line ${lineFrom1}`;
    }
    const before = lines.slice(0, lineFrom1 - 1);
    const after = lines.slice(lineFrom1 - 1);
    return before.concat([newLine]).concat(after).join("\n");
}

function getLine(content: string, lineFrom1: number) {
    const lines = content.split("\n");
    if (lines.length < lineFrom1) {
        return `## oops, there are only ${lines.length} lines. Unable to retrieve line ${lineFrom1}`;
    }
    return lines[lineFrom1 - 1];
}

@Parameters()
class InsertAboveLineParameters {
    @Parameter()
    public lineFrom1: number;

    @Parameter()
    public path: string;

    @Parameter()
    public previousContent: string;

    @Parameter()
    public insert: string;

    @Parameter()
    public message: string;

    public targets: BranchInRepoParameters = new BranchInRepoParameters();
}


export function insertAboveLineCommand(): HandleCommand {
    return editorHandler<InsertAboveLineParameters>(params => insertAboveLine(params.path,
        params.lineFrom1, params.previousContent, params.insert), InsertAboveLineParameters,
        "InsertAboveLine", {
            editMode: p => ({
                branch: p.targets.sha,
                message: p.message,
            }),
        });
}