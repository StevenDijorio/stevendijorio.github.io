import { NextRequest } from 'next/server';
import { z } from 'zod';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const exportSchema = z.object({
  originalText: z.string(),
  rewrittenText: z.string(),
  originalScore: z.number(),
  newScore: z.number(),
  improvements: z.array(z.string())
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { originalText, rewrittenText, originalScore, newScore, improvements } = exportSchema.parse(body);
    
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // US Letter size
    const { width, height } = page.getSize();
    
    // Load fonts
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    let yPosition = height - 50;
    
    // Title
    page.drawText('Paper Rewriter - Analysis Report', {
      x: 50,
      y: yPosition,
      size: 18,
      font: boldFont,
      color: rgb(0, 0, 0)
    });
    yPosition -= 30;
    
    // Date
    page.drawText(`Generated: ${new Date().toLocaleDateString()}`, {
      x: 50,
      y: yPosition,
      size: 10,
      font: font,
      color: rgb(0.5, 0.5, 0.5)
    });
    yPosition -= 40;
    
    // Score comparison
    page.drawText('Score Analysis', {
      x: 50,
      y: yPosition,
      size: 14,
      font: boldFont,
      color: rgb(0, 0, 0)
    });
    yPosition -= 20;
    
    page.drawText(`Original Score: ${originalScore.toFixed(1)}`, {
      x: 50,
      y: yPosition,
      size: 12,
      font: font,
      color: rgb(0, 0, 0)
    });
    yPosition -= 15;
    
    page.drawText(`Improved Score: ${newScore.toFixed(1)}`, {
      x: 50,
      y: yPosition,
      size: 12,
      font: font,
      color: rgb(0, 0, 0)
    });
    yPosition -= 15;
    
    const scoreImprovement = newScore - originalScore;
    page.drawText(`Improvement: +${scoreImprovement.toFixed(1)} points`, {
      x: 50,
      y: yPosition,
      size: 12,
      font: font,
      color: scoreImprovement > 0 ? rgb(0, 0.6, 0) : rgb(0.6, 0, 0)
    });
    yPosition -= 30;
    
    // Improvements
    if (improvements.length > 0) {
      page.drawText('Key Improvements:', {
        x: 50,
        y: yPosition,
        size: 14,
        font: boldFont,
        color: rgb(0, 0, 0)
      });
      yPosition -= 20;
      
      improvements.forEach((improvement, index) => {
        if (yPosition < 100) {
          // Add new page if running out of space
          const newPage = pdfDoc.addPage([612, 792]);
          yPosition = newPage.getSize().height - 50;
        }
        
        page.drawText(`• ${improvement}`, {
          x: 50,
          y: yPosition,
          size: 10,
          font: font,
          color: rgb(0, 0, 0)
        });
        yPosition -= 15;
      });
      yPosition -= 20;
    }
    
    // Original text (truncated if too long)
    page.drawText('Original Text:', {
      x: 50,
      y: yPosition,
      size: 14,
      font: boldFont,
      color: rgb(0, 0, 0)
    });
    yPosition -= 20;
    
    const maxOriginalLength = 500;
    const truncatedOriginal = originalText.length > maxOriginalLength 
      ? originalText.substring(0, maxOriginalLength) + '...'
      : originalText;
    
    const originalLines = truncatedOriginal.split('\n');
    originalLines.forEach(line => {
      if (yPosition < 100) {
        const newPage = pdfDoc.addPage([612, 792]);
        yPosition = newPage.getSize().height - 50;
      }
      
      if (line.length > 80) {
        // Split long lines
        const words = line.split(' ');
        let currentLine = '';
        for (const word of words) {
          if ((currentLine + word).length > 80) {
            page.drawText(currentLine.trim(), {
              x: 50,
              y: yPosition,
              size: 10,
              font: font,
              color: rgb(0, 0, 0)
            });
            yPosition -= 12;
            currentLine = word + ' ';
          } else {
            currentLine += word + ' ';
          }
        }
        if (currentLine.trim()) {
          page.drawText(currentLine.trim(), {
            x: 50,
            y: yPosition,
            size: 10,
            font: font,
            color: rgb(0, 0, 0)
          });
          yPosition -= 12;
        }
      } else {
        page.drawText(line, {
          x: 50,
          y: yPosition,
          size: 10,
          font: font,
          color: rgb(0, 0, 0)
        });
        yPosition -= 12;
      }
    });
    
    yPosition -= 20;
    
    // Rewritten text (truncated if too long)
    page.drawText('Rewritten Text:', {
      x: 50,
      y: yPosition,
      size: 14,
      font: boldFont,
      color: rgb(0, 0, 0)
    });
    yPosition -= 20;
    
    const maxRewrittenLength = 500;
    const truncatedRewritten = rewrittenText.length > maxRewrittenLength 
      ? rewrittenText.substring(0, maxRewrittenLength) + '...'
      : rewrittenText;
    
    const rewrittenLines = truncatedRewritten.split('\n');
    rewrittenLines.forEach(line => {
      if (yPosition < 100) {
        const newPage = pdfDoc.addPage([612, 792]);
        yPosition = newPage.getSize().height - 50;
      }
      
      if (line.length > 80) {
        // Split long lines
        const words = line.split(' ');
        let currentLine = '';
        for (const word of words) {
          if ((currentLine + word).length > 80) {
            page.drawText(currentLine.trim(), {
              x: 50,
              y: yPosition,
              size: 10,
              font: font,
              color: rgb(0, 0, 0)
            });
            yPosition -= 12;
            currentLine = word + ' ';
          } else {
            currentLine += word + ' ';
          }
        }
        if (currentLine.trim()) {
          page.drawText(currentLine.trim(), {
            x: 50,
            y: yPosition,
            size: 10,
            font: font,
            color: rgb(0, 0, 0)
          });
          yPosition -= 12;
        }
      } else {
        page.drawText(line, {
          x: 50,
          y: yPosition,
          size: 10,
          font: font,
          color: rgb(0, 0, 0)
        });
        yPosition -= 12;
      }
    });
    
    // Footer
    const lastPage = pdfDoc.getPages()[pdfDoc.getPages().length - 1];
    lastPage.drawText('Generated by Paper Rewriter - Your text is never stored', {
      x: 50,
      y: 30,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5)
    });
    
    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();
    
    return new Response(new Uint8Array(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="rewrite-analysis.pdf"',
      },
    });
    
  } catch (error) {
    console.error('PDF export error:', error);
    
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: 'Invalid export data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    return new Response(JSON.stringify({ error: 'PDF generation failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
