/** Start the back camera in the given <video>. Returns false if unavailable. */
export async function startCamera(video: HTMLVideoElement): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    return true;
  } catch (err) {
    console.warn('camera unavailable', err);
    return false;
  }
}
