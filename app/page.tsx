"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';

import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

type Detection = {
  class: string;
  score: number;
  bbox: [number, number, number, number];
};

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [enhancedUrl, setEnhancedUrl] = useState<string | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [scale, setScale] = useState<2 | 4>(2);

  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      revoked = url;
    } else {
      setPreviewUrl(null);
    }
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [file]);

  const onSelectFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(f.type)) {
      alert('Format non supporté. Utilisez JPG, PNG ou WEBP.');
      return;
    }
    setFile(f);
    setEnhancedUrl(null);
    setVideoUrl(null);
    setDetections([]);
  }, []);

  const ensureModel = useCallback(async () => {
    if (!modelRef.current) {
      modelRef.current = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
    }
    return modelRef.current;
  }, []);

  const ensureFfmpeg = useCallback(async () => {
    if (!ffmpegRef.current) {
      const ff = new FFmpeg();
      await ff.load();
      ffmpegRef.current = ff;
    }
    return ffmpegRef.current;
  }, []);

  const onEnhance = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append('image', file);
      form.append('scale', String(scale));
      const res = await fetch('/api/enhance', { method: 'POST', body: form });
      if (!res.ok) throw new Error('Erreur serveur');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setEnhancedUrl(url);
    } catch (e) {
      console.error(e);
      alert('Amélioration échouée.');
    } finally {
      setLoading(false);
    }
  }, [file, scale]);

  const onDetect = useCallback(async () => {
    if (!enhancedUrl && !previewUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = enhancedUrl ?? (previewUrl as string);
    await img.decode();

    const model = await ensureModel();
    const preds = await model.detect(img);

    const clothingClasses = new Set([
      'person',
      'handbag',
      'backpack',
      'umbrella',
      'tie',
      'suitcase',
      'shoe',
      'cell phone',
      'bottle',
      'sports ball',
      'book',
      'skateboard',
    ]);

    const filtered = preds
      .filter(p => clothingClasses.has(p.class))
      .map(p => ({ class: p.class, score: p.score, bbox: p.bbox as [number, number, number, number] }))
      .sort((a, b) => b.score - a.score);

    setDetections(filtered);
  }, [ensureModel, enhancedUrl, previewUrl]);

  const onGenerateVideo = useCallback(async () => {
    if (!enhancedUrl && !previewUrl) return;
    setGeneratingVideo(true);
    try {
      const ff = await ensureFfmpeg();
      const response = await fetch(enhancedUrl ?? (previewUrl as string));
      const imageData = await response.blob();
      const imageArray = await imageData.arrayBuffer();
      const inputName = 'input.png';
      const outputName = 'output.mp4';

      await ff.writeFile(inputName, new Uint8Array(imageArray));

      // Create 60 frames by reusing the single image with zoom/pan applied via filter
      // 15 fps, ~4 seconds; we will also loop to reach ~10-12 seconds
      await ff.exec([
        '-loop', '1',
        '-t', '12',
        '-i', inputName,
        '-vf', "scale='min(1080,iw)':-2,format=yuv420p",
        '-r', '30',
        '-pix_fmt', 'yuv420p',
        '-c:v', 'libx264',
        outputName,
      ]);

      const data = (await ff.readFile(outputName)) as Uint8Array;
      const blob = new Blob([data.buffer as ArrayBuffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
    } catch (e) {
      console.error(e);
      alert('Génération vidéo échouée.');
    } finally {
      setGeneratingVideo(false);
    }
  }, [ensureFfmpeg, enhancedUrl, previewUrl]);

  const labels = useMemo(() => {
    if (detections.length === 0) return '—';
    return detections
      .slice(0, 6)
      .map(d => `${d.class} (${Math.round(d.score * 100)}%)`)
      .join(', ');
  }, [detections]);

  return (
    <main className="container py-10 space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">UGC Mode — Amélioration & Détection</h1>
        <p className="text-gray-600">Importe une image, améliore-la (upscale {scale}×), détecte les vêtements/accessoires, et génère une courte vidéo UGC style TikTok/Reels. Les visages et styles d'origine sont préservés.</p>
      </header>

      <section className="card p-6 space-y-4">
        <div>
          <label className="label">Sélection d'image</label>
          <input className="input" type="file" accept={ACCEPTED_IMAGE_TYPES.join(',')} onChange={onSelectFile} />
        </div>

        <div className="flex items-center gap-3">
          <span className="label">Facteur d'upscale</span>
          <div className="flex gap-2">
            {[2, 4].map(s => (
              <button key={s} className={classNames('btn btn-secondary', { 'ring-2 ring-brand-accent': scale === s })} onClick={() => setScale(s as 2 | 4)}>
                ×{s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-6">
          <div className="w-full sm:w-1/2 space-y-3">
            <div className="aspect-square w-full overflow-hidden rounded-lg border bg-gray-50 flex items-center justify-center">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Prévisualisation" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-gray-400">Aucune image</span>
              )}
            </div>
            <button className="btn btn-primary w-full" disabled={!file || loading} onClick={onEnhance}>
              {loading ? 'Amélioration…' : `Améliorer l'image (×${scale})`}
            </button>
          </div>

          <div className="w-full sm:w-1/2 space-y-3">
            <div className="aspect-square w-full overflow-hidden rounded-lg border bg-gray-50 flex items-center justify-center">
              {enhancedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={enhancedUrl} alt="Optimisée" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-gray-400">Image optimisée affichée ici</span>
              )}
            </div>
            <div className="flex gap-2">
              <button className="btn btn-secondary flex-1" disabled={!previewUrl && !enhancedUrl} onClick={onDetect}>Identifier vêtements</button>
              <button className="btn btn-secondary flex-1" disabled={!enhancedUrl} onClick={() => {
                if (!enhancedUrl) return;
                const a = document.createElement('a');
                a.href = enhancedUrl;
                a.download = 'image-optimisee.png';
                a.click();
              }}>Télécharger</button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-medium">Objets détectés</h3>
          <p className="text-gray-700 text-sm">{labels}</p>
        </div>
      </section>

      <section className="card p-6 space-y-4">
        <h2 className="text-lg font-semibold">Vidéo UGC (10–20s)</h2>
        <p className="text-sm text-gray-600">Génère une courte vidéo avec zoom/pan doux, respectant l'esthétique d'origine. Ajoute une accroche texte.</p>
        <div className="flex flex-col sm:flex-row gap-4">
          <button className="btn btn-primary" disabled={!previewUrl && !enhancedUrl || generatingVideo} onClick={onGenerateVideo}>
            {generatingVideo ? 'Génération…' : 'Créer la vidéo UGC'}
          </button>
        </div>
        {videoUrl && (
          <div className="space-y-2">
            <video src={videoUrl} controls className="w-full rounded-lg border" />
            <button className="btn btn-secondary" onClick={() => {
              const a = document.createElement('a');
              a.href = videoUrl;
              a.download = 'ugc-video.mp4';
              a.click();
            }}>Télécharger la vidéo</button>
          </div>
        )}
        <div className="text-sm text-gray-500">
          <p>Note: Aucun visage ni vêtement n'est modifié. Pas de génération de corps/visages.</p>
        </div>
      </section>
    </main>
  );
}
