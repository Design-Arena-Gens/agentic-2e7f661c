import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const image = form.get('image');
    const scaleStr = (form.get('scale') ?? '2').toString();
    const scale = Math.max(1, Math.min(4, parseInt(scaleStr, 10) || 2));

    if (!(image instanceof File)) {
      return NextResponse.json({ error: 'No image' }, { status: 400 });
    }

    const arrayBuffer = await image.arrayBuffer();
    const input = Buffer.from(arrayBuffer);

    // Use sharp for: denoise (median), color/brightness, and upscale without altering composition
    const metadata = await sharp(input).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const processed = await sharp(input)
      .median(1) // gentle denoise
      .modulate({ brightness: 1.05, saturation: 1.03 })
      .linear(1.02, -2) // slight contrast adjustment
      .resize(targetWidth, targetHeight, { fit: 'inside', kernel: sharp.kernel.lanczos3, withoutEnlargement: false })
      .toFormat('png', { compressionLevel: 9 })
      .toBuffer();

    const body = new Uint8Array(processed);
    return new NextResponse(body as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
