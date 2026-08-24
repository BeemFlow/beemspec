import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const size = {
  width: 180,
  height: 180,
};

export const contentType = 'image/png';

const favicon = await readFile(join(process.cwd(), 'public/favicon.png'));
const faviconDataUrl = `data:image/png;base64,${favicon.toString('base64')}`;

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        alignItems: 'center',
        background: '#F8F5F0',
        display: 'flex',
        height: '100%',
        justifyContent: 'center',
        width: '100%',
      }}
    >
      <img alt="" height={144} src={faviconDataUrl} width={144} />
    </div>,
    size,
  );
}
