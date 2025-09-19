import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import { dirname, join } from 'path';
import { createInterface } from 'readline';
import { DomainEvent, StoredEvent } from '../../domain/events';

const DEFAULT_DATA_DIR = join(process.cwd(), 'data');
const DEFAULT_EVENTS_FILE = join(DEFAULT_DATA_DIR, 'events.jsonl');

export class FileEventStore {
  private initialized = false;
  private lastOffset = -1;

  constructor(private readonly filePath: string = DEFAULT_EVENTS_FILE) {}

  async append(event: DomainEvent): Promise<StoredEvent> {
    await this.ensureInitialized();

    const offset = this.lastOffset + 1;
    const record: StoredEvent = {
      ...event,
      offset,
    };

    const line = `${JSON.stringify(record)}\n`;
    await fs.appendFile(this.filePath, line, 'utf8');

    this.lastOffset = offset;
    return record;
  }

  async *stream(fromOffset = 0): AsyncGenerator<StoredEvent> {
    await this.ensureFileReady();

    const stream = createReadStream(this.filePath, { encoding: 'utf8' });
    const reader = createInterface({ input: stream, crlfDelay: Infinity });

    try {
      for await (const line of reader) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        const record = JSON.parse(trimmed) as StoredEvent;
        if (record.offset >= fromOffset) {
          yield record;
        }
      }
    } finally {
      reader.close();
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.ensureFileReady();
    this.lastOffset = await this.readLastOffset();
    this.initialized = true;
  }

  private async ensureFileReady(): Promise<void> {
    const directory = dirname(this.filePath);
    await fs.mkdir(directory, { recursive: true });

    try {
      await fs.access(this.filePath);
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        await fs.writeFile(this.filePath, '', 'utf8');
        return;
      }
      throw err;
    }
  }

  private async readLastOffset(): Promise<number> {
    try {
      const handle = await fs.open(this.filePath, 'r');
      try {
        const stream = handle.createReadStream({ encoding: 'utf8' });
        const reader = createInterface({ input: stream, crlfDelay: Infinity });
        let lastOffset = -1;

        for await (const line of reader) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }

          const record = JSON.parse(trimmed) as StoredEvent;
          lastOffset = record.offset;
        }

        reader.close();
        return lastOffset;
      } finally {
        await handle.close();
      }
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return -1;
      }
      throw err;
    }
  }
}
