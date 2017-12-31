import "mocha";
import { getFileContentFromGithub } from "../../src/util/getFileContent";

const MyGithubToken = process.env.GITHUB_TOKEN;

describe("getting the file content", () => {

    it.skip("fetches stuff", done => {

        getFileContentFromGithub(MyGithubToken, { name: "carrot", owner: "satellite-of-love", ref: "master"}, "README.md")
            .then(line => {
                console.log("Woo: " + line);
            })
            .then(() => done(), done);
    });

});
