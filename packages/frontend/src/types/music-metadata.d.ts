declare module 'music-metadata' {
  interface IPicture {
    format: string;
    data: Uint8Array<ArrayBuffer>;
  }

  interface ICommonTagsResult {
    title?: string;
    artist?: string;
    album?: string;
    picture?: IPicture[];
  }

  interface IAudioMetadata {
    common: ICommonTagsResult;
  }

  interface IOptions {
    skipCovers?: boolean;
  }

  export function parseBlob(blob: Blob, options?: IOptions): Promise<IAudioMetadata>;
}
