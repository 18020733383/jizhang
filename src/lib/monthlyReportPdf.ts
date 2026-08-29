type Html2Canvas = typeof import('html2canvas')['default'];

async function capturePdfPage(
  html2canvas: Html2Canvas,
  source: HTMLElement,
  darkMode: boolean,
): Promise<HTMLCanvasElement> {
  const contentWidth = 1080;
  const padding = 28;
  const captureRoot = document.createElement('div');
  const clone = source.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[data-pdf-exclude]').forEach((node) => node.remove());
  clone.style.width = `${contentWidth}px`;
  clone.style.maxWidth = 'none';
  clone.style.margin = '0';
  clone.style.height = 'auto';
  clone.style.maxHeight = 'none';
  clone.style.overflow = 'visible';
  clone.style.transform = 'none';

  captureRoot.style.position = 'fixed';
  captureRoot.style.left = '0';
  captureRoot.style.top = '0';
  captureRoot.style.width = `${contentWidth + padding * 2}px`;
  captureRoot.style.boxSizing = 'border-box';
  captureRoot.style.padding = `${padding}px`;
  captureRoot.style.pointerEvents = 'none';
  captureRoot.style.zIndex = '2147483647';
  captureRoot.style.colorScheme = darkMode ? 'dark' : 'light';
  captureRoot.style.background = darkMode
    ? 'linear-gradient(145deg, #020617 0%, #0f172a 52%, #172554 100%)'
    : 'linear-gradient(145deg, #e0e7ff 0%, #f8fafc 52%, #ecfeff 100%)';
  captureRoot.appendChild(clone);
  document.body.appendChild(captureRoot);

  try {
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    return await html2canvas(captureRoot, {
      backgroundColor: darkMode ? '#0f172a' : '#eef2ff',
      foreignObjectRendering: true,
      height: captureRoot.scrollHeight,
      imageTimeout: 10000,
      logging: false,
      scale: Math.min(2, Math.max(1.5, window.devicePixelRatio || 1)),
      useCORS: true,
      width: captureRoot.scrollWidth,
      windowHeight: captureRoot.scrollHeight,
      windowWidth: contentWidth + padding * 2,
      scrollX: 0,
      scrollY: 0,
    });
  } finally {
    captureRoot.remove();
  }
}

/** Render the two report groups as two designed A4 pages instead of slicing one long screenshot. */
export async function exportElementToPdf(element: HTMLElement, fileName: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  const pageSources = Array.from(element.querySelectorAll<HTMLElement>('[data-pdf-page]'));
  if (pageSources.length !== 2) throw new Error('月报需要正好两个 PDF 页面区块');

  const darkMode = document.documentElement.classList.contains('dark');
  const canvases: HTMLCanvasElement[] = [];
  for (const source of pageSources) canvases.push(await capturePdfPage(html2canvas, source, darkMode));

  const pdf = new jsPDF({ compress: true, format: 'a4', orientation: 'portrait', unit: 'mm' });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 6;
  const contentWidth = pageWidth - margin * 2;
  const contentHeight = pageHeight - margin * 2;

  canvases.forEach((canvas, index) => {
    if (canvas.width === 0 || canvas.height === 0) throw new Error(`PDF 第 ${index + 1} 页内容为空`);
    if (index > 0) pdf.addPage();
    if (darkMode) pdf.setFillColor(15, 23, 42);
    else pdf.setFillColor(238, 242, 255);
    pdf.rect(0, 0, pageWidth, pageHeight, 'F');
    const scale = Math.min(contentWidth / canvas.width, contentHeight / canvas.height);
    const imageWidth = canvas.width * scale;
    const imageHeight = canvas.height * scale;
    const x = (pageWidth - imageWidth) / 2;
    const y = margin;
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.93), 'JPEG', x, y, imageWidth, imageHeight, undefined, 'FAST');
    pdf.setFontSize(7);
    pdf.setTextColor(darkMode ? 148 : 100, darkMode ? 163 : 116, darkMode ? 184 : 139);
    pdf.text(`FLOW  |  ${index + 1} / ${canvases.length}`, pageWidth - margin, pageHeight - 2.5, { align: 'right' });
  });

  pdf.save(fileName);
}
