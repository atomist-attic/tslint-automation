import { CommandHandler, HandleCommand, HandlerContext } from "@atomist/automation-client";
import { configuration } from "../atomist.config";
import { whereAmIRunning } from "../util/provenance";

@CommandHandler("Reveal the running version", "hello tslint-automation")
export class HelloWorld implements HandleCommand {

    public handle(context: HandlerContext) {

        return whereAmIRunning().then(provenance =>
            context.messageClient.respond(
                `Hello from ${configuration.name}:${configuration.version} at ${provenance}`,
            ));
    }

}
