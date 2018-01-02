import { EventFired, EventHandler, HandleEvent, HandlerContext, HandlerResult, Success } from "@atomist/automation-client";
import { subscriptionFromFile } from "@atomist/automation-client/graph/graphQL";
import * as slack from "@atomist/slack-messages/SlackMessages";
import { adminSlackUserNames } from "../atomist.config";
import * as graphql from "../typings/types";

const MyGitHubOrganization = "atomist";
const MyGitHubRepository = "tslint-automation";

@EventHandler("Deploy myself; update the image in k8s when a build succeeds",
    subscriptionFromFile("graphql/successfulBuild"))
export class DeployAfterSuccessfulBuild implements HandleEvent<graphql.SuccessfulBuild.Subscription> {

    public handle(event: EventFired<graphql.SuccessfulBuild.Subscription>,
                  context: HandlerContext): Promise<HandlerResult> {

        const build = event.data.Build[0];

        if (build.repo.name !== MyGitHubRepository ||
            build.repo.owner !== MyGitHubOrganization ||
            build.push.branch !== "master") {
            // my dm is gonna get even spammier
            return context.messageClient.addressUsers(
                `There was ${slack.url(build.buildUrl, "a successful build")}, but it wasn't mine`, adminSlackUserNames)
                .then(() => Promise.resolve(Success));
        }
        return context.messageClient.addressUsers("I would now like to deploy tag " + build.name, adminSlackUserNames)
            .then(() => Success);
    }
}
