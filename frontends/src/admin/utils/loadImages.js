// src/utils/loadAssets.js

async function preload(urls) {
  const promises = urls.map((url) =>
    new Promise((resolve) => {
      const isMedia = /\.(mp3|mp4|wav|ogg)$/i.test(url);
      if (isMedia) {
        const audio = new Audio();
        audio.oncanplaythrough = resolve;
        audio.onerror = resolve;
        audio.src = url;
      } else {
        const img = new Image();
        img.onload = resolve;
        img.onerror = resolve;
        img.src = url;
      }
    })
  );
  await Promise.all(promises);
}

export async function loadBundledAssets() {
  let urls = [];

  if (import.meta.env.PROD) {
    try {
      const manifest = await fetch('/manifest.json').then((r) => r.json());
      urls = Object.values(manifest)
        .flatMap((entry) => [entry.file, ...(entry.css || []), ...(entry.assets || [])])
        .filter((u) => /\.(png|jpe?g|svg|webp|gif|ico|mp3|mp4)$/i.test(u))
        .map((u) => (u.startsWith('/') ? u : `/${u}`));
    } catch (e) {
      console.warn('Failed to load manifest.json, falling back to glob eager', e);
    }
  }

  if (!urls.length) {
    const modules = import.meta.glob('/src/admin/assets/**/*.{png,jpg,jpeg,svg,webp,gif,ico,mp3,mp4}', { eager: true });
    urls = Object.values(modules).map((mod) => mod.default);
  }

  await preload(urls);
      console.log("Assets loaded");
}

export async function loadPublicAssets() {
  const modules = import.meta.glob('/*.{png,jpg,jpeg,svg,webp,gif,ico,mp3,mp4}', { eager: true });
  const urls = Object.values(modules).map((mod) => mod.default);

  if (sessionStorage.getItem('AdminPublicAssetsLoaded')) return;
    console.log("Public asstes loaded");
  await preload(urls);
  sessionStorage.setItem('AdminPublicAssetsLoaded', 'true');
}

export async function loadAllAssets() {
  await loadBundledAssets();
  await loadPublicAssets();
  console.log('✅ All assets preloaded');
}