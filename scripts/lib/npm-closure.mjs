import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { x as extractTar } from "tar";

export function measureDirectoryClosure(directory) {
  const pending = [directory];
  let fileCount = 0;
  let unpackedBytes = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      const stat = lstatSync(path);
      if (stat.isDirectory()) pending.push(path);
      else if (stat.isFile()) {
        fileCount += 1;
        unpackedBytes += stat.size;
      }
    }
  }
  return { fileCount, unpackedBytes };
}

export async function extractAndMeasureNpmClosure(tarball, directory) {
  await extractTar({ file: tarball, cwd: directory, strict: true, preservePaths: false });
  return measureDirectoryClosure(directory);
}
