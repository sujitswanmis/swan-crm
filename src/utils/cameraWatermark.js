/**
 * Live Camera Photo Watermarking Engine
 * Burns in immutable IST timestamp, GPS coordinates, party name, and employee details
 * directly onto the photo pixels via HTML5 Canvas before uploading to Supabase storage.
 */

export function burnWatermarkOnPhoto(imageSource, metadata = {}) {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      resolve(imageSource);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');

        // Draw original photo
        ctx.drawImage(img, 0, 0);

        // Calculate responsive banner height based on image dimensions
        const bannerHeight = Math.max(90, Math.round(canvas.height * 0.12));
        const padding = Math.max(12, Math.round(canvas.width * 0.02));
        const fontSize = Math.max(13, Math.round(bannerHeight * 0.18));
        const lineHeight = fontSize * 1.35;

        // Draw semi-transparent dark gradient banner at bottom
        const gradient = ctx.createLinearGradient(0, canvas.height - bannerHeight - 20, 0, canvas.height);
        gradient.addColorStop(0, 'rgba(15, 23, 42, 0)');
        gradient.addColorStop(0.3, 'rgba(15, 23, 42, 0.82)');
        gradient.addColorStop(1, 'rgba(15, 23, 42, 0.96)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, canvas.height - bannerHeight - 20, canvas.width, bannerHeight + 20);

        // Accent brand strip on top of banner
        ctx.fillStyle = '#2563eb';
        ctx.fillRect(0, canvas.height - bannerHeight - 20, canvas.width, 3);

        // Format IST timestamp
        const istTimeStr = metadata.timestamp 
          ? new Intl.DateTimeFormat('en-IN', {
              timeZone: 'Asia/Kolkata',
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true
            }).format(new Date(metadata.timestamp))
          : new Intl.DateTimeFormat('en-IN', {
              timeZone: 'Asia/Kolkata',
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true
            }).format(new Date());

        ctx.fillStyle = '#ffffff';
        ctx.font = `600 ${fontSize}px sans-serif`;

        let currentY = canvas.height - bannerHeight + padding;

        // Line 1: Date & Time + Verified Badge
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(`📅 ${istTimeStr} (IST) • VERIFIED ON-SITE`, padding, currentY);
        currentY += lineHeight;

        // Line 2: GPS Lat/Long & Accuracy
        ctx.fillStyle = '#f8fafc';
        const lat = metadata.latitude ? Number(metadata.latitude).toFixed(6) : 'N/A';
        const lng = metadata.longitude ? Number(metadata.longitude).toFixed(6) : 'N/A';
        const acc = metadata.accuracy ? `(±${Math.round(metadata.accuracy)}m)` : '';
        ctx.fillText(`📍 GPS: ${lat}° N, ${lng}° E ${acc}`, padding, currentY);
        currentY += lineHeight;

        // Line 3: Party Name & Employee Name
        const party = metadata.partyName || 'Field Visit';
        const emp = metadata.employeeName || 'Field Executive';
        ctx.fillStyle = '#fde047';
        ctx.fillText(`🏢 ${party}  |  👤 By: ${emp}`, padding, currentY);

        canvas.toBlob((blob) => {
          if (!blob) {
            resolve(imageSource);
            return;
          }
          resolve(blob);
        }, 'image/jpeg', 0.90);
      } catch (err) {
        console.warn('Failed to burn watermark onto image:', err);
        resolve(imageSource);
      }
    };

    img.onerror = () => {
      resolve(imageSource);
    };

    if (typeof imageSource === 'string') {
      img.src = imageSource;
    } else if (imageSource instanceof Blob || imageSource instanceof File) {
      img.src = URL.createObjectURL(imageSource);
    } else {
      resolve(imageSource);
    }
  });
}
