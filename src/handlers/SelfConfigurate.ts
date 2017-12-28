import { failedEdit, ProjectEditor, successfulEdit } from "@atomist/automation-client/operations/edit/projectEditor";
import { Project } from "@atomist/automation-client/project/Project";
import {
    HandleCommand, HandlerContext, HandlerResult, MappedParameter, MappedParameters, Parameter, Secret, Secrets,
    Success,
} from "@atomist/automation-client";
import { Parameters } from "@atomist/automation-client/decorators";
import { GitCommandGitProject } from "@atomist/automation-client/project/git/GitCommandGitProject";
import { adminCreds, adminSlackUserNames } from "../atomist.config";
import { GitHubRepoRef } from "@atomist/automation-client/operations/common/GitHubRepoRef";
import * as slack from "@atomist/slack-messages/SlackMessages";

const whereToAdd = /PeopleWhoDoNotWantMeToOfferToHelp *= *\[/;

export function addPersonWhoDoesNotWantMeToOfferToHelp(person: string): ProjectEditor {
    return (project: Project) => {
// can I ask, where is this file I'm in right now?
        return project.findFile("src/handlers/PushToTsLinting.ts").then(
            f => f.getContent().then(content => {
                if (content.match(whereToAdd)) {
                    return f.setContent(content.replace(whereToAdd,
                        // how do I put $0 in the replacement? maybe ya hafta put it in a group
                        `PeopleWhoDoNotWantMeToOfferToHelp = ["${person}", `))
                        .then(() => successfulEdit(project, true))
                } else {
                    return Promise.resolve(failedEdit(project, new Error("Didn't find the place to add them")))
                }
            }), findFileError => Promise.resolve(failedEdit(project, findFileError)))
    }
}

@Parameters()
export class StopBotheringMeParams {
    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

}

function initialReport(ctx: HandlerContext, parameters: StopBotheringMeParams) {
    return ctx.messageClient.addressUsers(`Sad day: ${slack.user(parameters.screenName)}`, adminSlackUserNames);
}


export class StopBotheringMe implements HandleCommand<StopBotheringMeParams> {
    public handle(ctx: HandlerContext, parameters: StopBotheringMeParams): Promise<HandlerResult> {
        // someday, parse reporef from package json
        return initialReport(ctx, parameters).then(() =>
        GitCommandGitProject.cloned(adminCreds, new GitHubRepoRef("atomist", "tslint-automation")))
            .then(project => addPersonWhoDoesNotWantMeToOfferToHelp(parameters.screenName)(project, ctx)
                .then(editResult => {
                    if (editResult.success && editResult.edited) {
                        return project.commit(`${parameters.screenName} doesn't want me to offer to help`)
                    }
                }).then(() => Success))
    }

    freshParametersInstance(): StopBotheringMeParams {
        return new StopBotheringMeParams();
    }

}