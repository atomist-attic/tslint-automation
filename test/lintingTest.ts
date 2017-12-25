import "mocha";
import { runTslint } from "../src/handlers/PushToTsLinting";
import * as stringify from "json-stringify-safe";

describe.skip("can we lint the thing?", () => {

    it("can lint a thing", done => {
        runTslint("/Users/jessitron/code/atomist/upgrade-client-automation")
            .then(
                result => {
                    console.log("what")
                    console.log(stringify(result));
                })
            .then(() => done(), done)
    }).timeout(100000)
});

