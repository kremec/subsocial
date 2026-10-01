/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { ModuleKind, transpileModule } from "typescript";

import {
  type canDownloadMedia,
  type downloadMedia,
} from "@/screens/feed/download-media";

const source = transpileModule(
  readFileSync(new URL("./download-media.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ModuleKind.CommonJS } },
).outputText;

function harness() {
  const calls: string[] = [];
  let timestamp = 123;
  let pickerError: Error | undefined;
  let downloadError: Error | undefined;
  let copyError: Error | undefined;
  let preexisting = false;
  const savedFiles: MockFile[] = [];
  class MockFile {
    name: string;
    constructor(_directory: MockDirectory, name: string) {
      this.name = name;
    }
    static async downloadFileAsync(url: string, destination: MockFile) {
      calls.push(`download:${url}:${destination.name}`);
      if (downloadError) throw downloadError;
      return destination;
    }
    async copy(destination: MockDirectory) {
      assert.ok(destination instanceof MockDirectory);
      calls.push(`copy:${this.name}`);
      savedFiles.push(new MockFile(destination, this.name));
      if (copyError) throw copyError;
    }
    delete() {
      calls.push("delete-destination");
      savedFiles.splice(savedFiles.indexOf(this), 1);
    }
  }
  class MockDirectory {
    static async pickDirectoryAsync() {
      calls.push("pick-directory");
      if (pickerError) throw pickerError;
      const directory = new MockDirectory();
      if (preexisting)
        savedFiles.push(new MockFile(directory, "subsocial-123.mp4"));
      return directory;
    }
    create() {
      calls.push("create-temporary");
    }
    list() {
      return savedFiles;
    }
    delete() {
      calls.push("delete-temporary");
    }
  }
  const exports = {} as {
    downloadMedia: typeof downloadMedia;
    canDownloadMedia: typeof canDownloadMedia;
  };
  runInNewContext(source, {
    exports,
    Error,
    URL,
    Date: { now: () => timestamp },
    require(name: string) {
      if (name === "expo-file-system") {
        return {
          Directory: MockDirectory,
          File: MockFile,
          Paths: { cache: "cache" },
        };
      }
      throw new Error(name);
    },
  });
  return {
    download: exports.downloadMedia,
    canDownload: exports.canDownloadMedia,
    calls,
    savedFiles,
    advanceTimestamp() {
      timestamp++;
    },
    existingDestination() {
      preexisting = true;
    },
    failPicker(error?: Error) {
      pickerError = error;
    },
    failDownload(error: Error) {
      downloadError = error;
    },
    failCopy(error: Error) {
      copyError = error;
    },
  };
}

test("canceling either platform's directory picker never starts a download", async () => {
  for (const code of ["ERR_PICKER_CANCELLED", "ERR_FILE_PICKING_CANCELLED"]) {
    const app = harness();
    app.failPicker(Object.assign(new Error("Canceled"), { code }));
    await app.download({ type: "image", url: "https://example.com/photo.jpg" });
    assert.deepEqual(app.calls, ["pick-directory"]);
  }
});

test("real picker failures are reported", async () => {
  const app = harness();
  app.failPicker(new Error("No file picker available"));
  await assert.rejects(
    app.download({ type: "image", url: "https://example.com/photo.jpg" }),
    /No file picker available/,
  );
  assert.deepEqual(app.calls, ["pick-directory"]);
});

test("concurrent callers share one download and a later request starts a new one", async () => {
  const app = harness();
  const media = {
    type: "video" as const,
    url: "https://example.com/video.mp4",
  };
  const first = app.download(media);
  const second = app.download(media);
  assert.equal(first, second);
  await Promise.all([first, second]);
  assert.equal(app.calls.filter((call) => call === "pick-directory").length, 1);
  assert.equal(
    app.calls.filter((call) => call.startsWith("download:")).length,
    1,
  );

  app.advanceTimestamp();
  await app.download(media);
  assert.equal(app.calls.filter((call) => call === "pick-directory").length, 2);
  assert.equal(
    app.calls.filter((call) => call.startsWith("download:")).length,
    2,
  );
});

test("a failed request can be retried", async () => {
  const app = harness();
  const media = {
    type: "image" as const,
    url: "https://example.com/photo.jpg",
  };
  app.failPicker(new Error("Picker unavailable"));
  await assert.rejects(app.download(media), /Picker unavailable/);
  app.failPicker();
  await app.download(media);
  assert.equal(app.calls.filter((call) => call === "pick-directory").length, 2);
  assert.equal(app.savedFiles.length, 1);
});

test("saving an extensionless X image uses its format and removes temporary files", async () => {
  const app = harness();
  const url = "https://pbs.twimg.com/media/abc?format=png&name=orig";
  await app.download({ type: "image", url });
  assert.deepEqual(app.calls, [
    "pick-directory",
    "create-temporary",
    `download:${url}:subsocial-123.png`,
    "copy:subsocial-123.png",
    "delete-temporary",
  ]);
});

test("a failed download cleans up partial cache files", async () => {
  const app = harness();
  app.failDownload(new Error("Download interrupted"));
  await assert.rejects(
    app.download({ type: "video", url: "https://example.com/video.mp4" }),
    /Download interrupted/,
  );
  assert.equal(app.calls.at(-1), "delete-temporary");
  assert.equal(
    app.calls.some((call) => call.startsWith("copy:")),
    false,
  );
});

test("a failed copy removes the incomplete destination and cached media", async () => {
  const app = harness();
  app.failCopy(new Error("Storage full"));
  await assert.rejects(
    app.download({ type: "video", url: "https://example.com/video.mp4" }),
    /Storage full/,
  );
  assert.deepEqual(app.calls.slice(-2), [
    "delete-destination",
    "delete-temporary",
  ]);
  assert.equal(app.savedFiles.length, 0);
});

test("a preexisting destination is never overwritten or deleted", async () => {
  const app = harness();
  app.existingDestination();
  await assert.rejects(
    app.download({ type: "video", url: "https://example.com/video.mp4" }),
    /already exists/,
  );
  assert.equal(app.savedFiles.length, 1);
  assert.equal(
    app.calls.some((call) => call.startsWith("copy:")),
    false,
  );
  assert.equal(app.calls.includes("delete-destination"), false);
  assert.equal(app.calls.at(-1), "delete-temporary");
});

test("streaming videos are unavailable for download and never save a playlist as mp4", async () => {
  for (const media of [
    {
      type: "video" as const,
      url: "https://example.com/play",
      contentType: "hls" as const,
    },
    {
      type: "video" as const,
      url: "https://v.redd.it/video/HLSPlaylist.m3u8?a=1",
    },
    {
      type: "video" as const,
      url: "https://example.com/manifest/hls_playlist/id/abc",
    },
  ]) {
    const app = harness();
    assert.equal(app.canDownload(media), false);
    await assert.rejects(
      app.download(media),
      /streaming videos is not supported/,
    );
    assert.deepEqual(app.calls, []);
  }
});

test("images and direct video files are available for download", () => {
  const app = harness();
  assert.equal(
    app.canDownload({ type: "image", url: "https://example.com/photo.jpg" }),
    true,
  );
  assert.equal(
    app.canDownload({ type: "video", url: "https://example.com/video.mp4" }),
    true,
  );
});
