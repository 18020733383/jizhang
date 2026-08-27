/** Capture the full report once, then crop it into A4 pages without clipping the app layout. */
export async function exportElementToPdf(element: HTMLElement, fileName: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  const sourceRect = element.getBoundingClientRect();
  const captureRoot = element.cloneNode(true) as HTMLElement;
  captureRoot.removeAttribute('id');
  captureRoot.style.position = 'fixed';
  captureRoot.style.left = '0';
  captureRoot.style.top = '0';
  captureRoot.style.width = `${sourceRect.width}px`;
  captureRoot.style.maxWidth = 'none';
  captureRoot.style.height = 'auto';
  captureRoot.style.maxHeight = 'none';
  captureRoot.style.paddingBottom = '0';
  captureRoot.style.overflow = 'visible';
  captureRoot.style.transform = 'none';
  captureRoot.style.zIndex = '2147483647';
  captureRoot.style.pointerEvents = 'none';
  captureRoot.style.background = '#ffffff';
  document.body.appendChild(captureRoot);

  try {
    if (!captureRoot.querySelector('[data-report-section]')) throw new Error('日报内容为空，无法生成 PDF');

    const canvas = await html2canvas(captureRoot, {
      backgroundColor: '#ffffff',
      foreignObjectRendering: true,
      height: captureRoot.scrollHeight,
      imageTimeout: 10000,
      logging: false,
      scale: Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
      useCORS: true,
      width: captureRoot.scrollWidth,
      windowHeight: captureRoot.scrollHeight,
      windowWidth: captureRoot.scrollWidth,
      scrollX: 0,
      scrollY: 0,
    });

    if (canvas.width === 0 || canvas.height === 0) throw new Error('日报内容为空，无法生成 PDF');

    const pdf = new jsPDF({ compress: true, format: 'a4', orientation: 'portrait', unit: 'mm' });
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 10;
    const contentWidth = pageWidth - margin * 2;
    const contentHeight = pageHeight - margin * 2;
    const maxSourceHeight = Math.max(1, Math.floor((contentHeight * canvas.width) / contentWidth));
    const captureRect = captureRoot.getBoundingClientRect();
    const poolMonthSection = captureRoot.querySelector<HTMLElement>('[data-report-section="pool-month"]');
    const preferredSplit = poolMonthSection
      ? Math.round((poolMonthSection.getBoundingClientRect().top - captureRect.top) * (canvas.width / captureRect.width))
      : 0;
    const ranges: Array<{ sourceTop: number; sourceHeight: number }> = [];

    if (preferredSplit > 0 && preferredSplit < canvas.height && preferredSplit <= maxSourceHeight) {
      ranges.push({ sourceTop: 0, sourceHeight: preferredSplit });
      let sourceTop = preferredSplit;
      while (sourceTop < canvas.height) {
        const sourceHeight = Math.min(maxSourceHeight, canvas.height - sourceTop);
        ranges.push({ sourceTop, sourceHeight });
        sourceTop += sourceHeight;
      }
    } else {
      let sourceTop = 0;
      while (sourceTop < canvas.height) {
        const sourceHeight = Math.min(maxSourceHeight, canvas.height - sourceTop);
        ranges.push({ sourceTop, sourceHeight });
        sourceTop += sourceHeight;
      }
    }

    ranges.forEach(({ sourceTop, sourceHeight }, index) => {
      if (index > 0) pdf.addPage();
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sourceHeight;
      const pageContext = pageCanvas.getContext('2d');
      if (!pageContext) throw new Error('无法准备 PDF 页面');
      pageContext.fillStyle = '#ffffff';
      pageContext.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      pageContext.drawImage(
        canvas,
        0,
        sourceTop,
        canvas.width,
        sourceHeight,
        0,
        0,
        pageCanvas.width,
        pageCanvas.height,
      );
      const imageHeight = (sourceHeight * contentWidth) / canvas.width;
      pdf.addImage(
        pageCanvas.toDataURL('image/png'),
        'PNG',
        margin,
        margin,
        contentWidth,
        imageHeight,
        undefined,
        'FAST',
      );
    });

    pdf.save(fileName);
  } finally {
    captureRoot.remove();
  }
}
