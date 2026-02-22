const path = require("node:path");
const { readFileSync } = require("node:fs");

const packageJsonPath = path.resolve(__dirname, "../package.json");
const packageName = JSON.parse(readFileSync(packageJsonPath, "utf8")).name;
const changelogPath = path.resolve(__dirname, "../CHANGELOG.md");

module.exports = {
    preset: "conventionalcommits",
    bumpFiles: [
        {
            filename: packageJsonPath,
            type: "json",
        },
    ],
    packageFiles: [packageJsonPath],
    writerOpts: {
        transform: (commit) => {
            if (commit.header.includes("automated update")) {
                return null;
            }

            return commit;
        },
    },
    changelogFile: changelogPath,
    releaseCommitMessageFormat: `chore(${packageName}): release version {{currentTag}}`,
};
