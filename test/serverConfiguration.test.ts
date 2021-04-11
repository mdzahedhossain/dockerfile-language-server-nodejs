/* --------------------------------------------------------------------------------------------
 * Copyright (c) Remy Suen. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as child_process from "child_process";
import * as assert from "assert";

// fork the server and connect to it using Node IPC
const lspProcess = child_process.fork("out/src/server.js", [ "--node-ipc" ]);
let messageId = 1;

function sendNotification(method: string, params: any): void {
	let message = {
		jsonrpc: "2.0",
		method: method,
		params: params
	};
	lspProcess.send(message);
}

function sendRequest(method: string, params: any): number {
	let message = {
		jsonrpc: "2.0",
		id: messageId++,
		method: method,
		params: params
	};
	lspProcess.send(message);
	return messageId - 1;
}

function sendResult(id: number, result: any): void {
	lspProcess.send({jsonrpc: "2.0", id, result});
}

function initialize(): number {
	return initializeCustomCapabilities({
		textDocument: {
			completion: {
				completionItem: {
					deprecatedSupport: true,
					snippetSupport: true
				}
			},
			hover: {
			},
			semanticTokens: {
				formats: [],
				requests: {
					full: {
						delta: false
					}
				},
				tokenModifiers: [],
				tokenTypes: []
			}
		},
		workspace: {configuration: true}
	});
}

function initializeCustomCapabilities(capabilities: any): number {
	return sendRequest("initialize", {
		rootPath: process.cwd(),
		processId: process.pid,
		capabilities
	});
}

describe("LSP server with configuration support", function() {
	it("initialize", finished => {
		this.timeout(5000);
		const responseId = initialize();
		lspProcess.once('message', json => {
			assert.equal(json.id, responseId);
			const capabilities = json.result.capabilities;
			assert.equal(capabilities.documentFormattingProvider, true);
			assert.equal(capabilities.documentRangeFormattingProvider, true);
			assert.equal(capabilities.documentOnTypeFormattingProvider.firstTriggerCharacter, '\\');
			assert.equal(capabilities.documentOnTypeFormattingProvider.moreTriggerCharacter, '`');
			finished();
		});
	});

	it("initialized", () => {
		sendNotification("initialized", {});
	});

	function test255(fileName: string, text: string, request: string, params: any, configurationSet: boolean, attribute: any, callback: Function): void {
		const configurationListener = (json: any) => {
			if (json.method === "workspace/configuration" && json.params.items.length > 0 && json.params.items[0].section === "docker.languageserver.formatter") {
				lspProcess.removeListener("message", configurationListener);
				if (configurationSet) {
					sendResult(json.id, [{ ignoreMultilineInstructions: attribute }]);
				} else {
					sendResult(json.id, [{}]);
				}
			}
		};
		lspProcess.on("message", configurationListener);

		const documentURI = "uri://dockerfile/" + fileName;
		sendNotification("textDocument/didOpen", {
			textDocument: {
				languageId: "dockerfile",
				version: 1,
				uri: documentURI,
				text: text
			}
		});

		params.textDocument.uri = documentURI;
		const requestId = sendRequest(request, params);

		const listener = (json: any) => {
			if (json.id === requestId && json.method !== "workspace/configuration") {
				lspProcess.removeListener("message", listener);
				sendNotification("textDocument/didClose", { textDocument: { uri: documentURI } });

				assert.ok(json.result instanceof Array);
				if (attribute === true) {
					assert.strictEqual(json.result.length, 0);
				} else {
					assert.strictEqual(json.result.length, 1);
					assert.strictEqual(json.result[0].newText, "    ");
					assert.strictEqual(json.result[0].range.start.line, 1);
					assert.strictEqual(json.result[0].range.start.character, 0);
					assert.strictEqual(json.result[0].range.end.line, 1);
					assert.strictEqual(json.result[0].range.end.character, 1);
				}
				callback();
			}
		};
		lspProcess.on("message", listener);
	}

	describe("issue #255 file configuration", () => {
		const fileFormattingRequest = {
			textDocument: {},
			options: { insertSpaces: true, tabSize: 4 }
		};

		const rangeFormattingRequest = {
			textDocument: {},
			range: {
				start: { line: 0, position: 3 },
				end: { line: 1, position: 3 }
			},
			options: { insertSpaces: true, tabSize: 4 }
		};

		const onTypeFormattingRequest = {
			textDocument: {},
			position: { line: 0, position: 12 },
			ch: "\\",
			options: { insertSpaces: true, tabSize: 4 }
		};

		it("textDocument/formatting file configuration not defined", finished => {
			this.timeout(5000);
			test255(
				"formatting-255-file-configuration-not-defined",
				"FROM node AS\\\n build",
				"textDocument/formatting",
				fileFormattingRequest,
				false,
				null,
				finished
			);
		});

		it("textDocument/formatting file configuration true", finished => {
			this.timeout(5000);
			test255(
				"formatting-255-file-configuration-true",
				"FROM node AS\\\n build",
				"textDocument/formatting",
				fileFormattingRequest,
				true,
				true,
				finished
			);
		});

		it("textDocument/formatting file configuration false", finished => {
			this.timeout(5000);
			test255(
				"formatting-255-file-configuration-false",
				"FROM node AS\\\n build",
				"textDocument/formatting",
				fileFormattingRequest,
				true,
				false,
				finished
			);
		});

		it("textDocument/rangeFormatting file configuration not defined", finished => {
			this.timeout(5000);
			test255(
				"range-formatting-255-file-configuration-not-defined",
				"FROM node AS\\\n build\nFROM node AS \\\n build",
				"textDocument/rangeFormatting",
				rangeFormattingRequest,
				false,
				null,
				finished
			);
		});

		it("textDocument/rangeFormatting file configuration true", finished => {
			this.timeout(5000);
			test255(
				"range-formatting-255-file-configuration-true",
				"FROM node AS\\\n build\nFROM node AS \\\n build",
				"textDocument/rangeFormatting",
				rangeFormattingRequest,
				true,
				true,
				finished
			);
		});

		it("textDocument/rangeFormatting file configuration false", finished => {
			this.timeout(5000);
			test255(
				"range-formatting-255-file-configuration-false",
				"FROM node AS\\\n build\nFROM node AS \\\n build",
				"textDocument/rangeFormatting",
				rangeFormattingRequest,
				true,
				false,
				finished
			);
		});

		it("textDocument/onTypeFormatting file configuration not defined", finished => {
			this.timeout(5000);
			test255(
				"on-type-formatting-255-file-configuration-not-defined",
				"FROM node AS\n build",
				"textDocument/onTypeFormatting",
				onTypeFormattingRequest,
				false,
				null,
				finished
			);
		});

		it("textDocument/onTypeFormatting file configuration true", finished => {
			this.timeout(5000);
			test255(
				"on-type-formatting-255-file-configuration-true",
				"FROM node AS\n build",
				"textDocument/onTypeFormatting",
				onTypeFormattingRequest,
				true,
				true,
				finished
			);
		});

		it("textDocument/onTypeFormatting file configuration false", finished => {
			this.timeout(5000);
			test255(
				"on-type-formatting-255-file-configuration-false",
				"FROM node AS\n build",
				"textDocument/onTypeFormatting",
				onTypeFormattingRequest,
				true,
				false,
				finished
			);
		});
	});

	after(() => {
		// terminate the forked LSP process after all the tests have been run
		lspProcess.kill();
	});
});
