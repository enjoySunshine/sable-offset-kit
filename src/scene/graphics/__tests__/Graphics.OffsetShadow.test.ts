import { CanvasGraphicsAdaptor } from '../canvas/CanvasGraphicsAdaptor';
import { Graphics } from '../shared/Graphics';
import { GraphicsContext } from '../shared/GraphicsContext';
import { GpuGraphicsContext } from '../shared/GraphicsContextSystem';
import { GraphicsPath } from '../shared/path/GraphicsPath';
import { graphicsContextToSvg } from '../shared/svg/SVGExporter';
import { buildContextBatches } from '../shared/utils/buildContextBatches';
import '../init';
import { Matrix } from '~/maths';

import type { GraphicsPipeLike } from '../shared/GraphicsPipe';

const WHITE_ONLY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" viewBox="10 10 40 20">'
    + '<path d="M10 10L50 10L50 30L10 30Z" fill="#ffffff"/></svg>';

const OFFSET_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="30" viewBox="10 10 64 30">'
    + '<path d="M34 20L74 20L74 40L34 40Z" fill="#202020"/>'
    + '<path d="M10 10L50 10L50 30L10 30Z" fill="#ffffff"/></svg>';

const ORIGIN_OFFSET_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="20" viewBox="0 0 34 20">'
    + '<path d="M24 10L34 10L34 20L24 20Z" fill="#202020"/>'
    + '<path d="M0 0L10 0L10 10L0 10Z" fill="#ffffff"/></svg>';

function createOffsetGraphics(): Graphics
{
    return new Graphics()
        .rect(10, 10, 40, 20)
        .fill('#ffffff')
        .addOffsetShadow(24, 10, '#202020');
}

function buildGeometry(graphics: Graphics): GpuGraphicsContext
{
    const gpuContext = new GpuGraphicsContext();

    buildContextBatches(graphics.context, gpuContext);

    return gpuContext;
}

describe('Graphics offset shadow', () =>
{
    describe('bounds', () =>
    {
        it('should only contain the white block without the shadow', () =>
        {
            const graphics = new Graphics()
                .rect(10, 10, 40, 20)
                .fill('#ffffff');

            const { minX, minY, maxX, maxY } = graphics.bounds;

            expect(minX).toBe(10);
            expect(minY).toBe(10);
            expect(maxX).toBe(50);
            expect(maxY).toBe(30);

            graphics.destroy();
        });

        it('should extend the bounds to include the offset shadow', () =>
        {
            const graphics = createOffsetGraphics();
            const { minX, minY, maxX, maxY } = graphics.bounds;

            expect(minX).toBe(10);
            expect(minY).toBe(10);
            expect(maxX).toBe(74);
            expect(maxY).toBe(40);

            graphics.destroy();
        });

        it('should extend the bounds of a block at the origin', () =>
        {
            const graphics = new Graphics()
                .rect(0, 0, 10, 10)
                .fill('#ffffff')
                .addOffsetShadow(24, 10, '#202020');

            const { minX, minY, maxX, maxY } = graphics.bounds;

            expect(minX).toBe(0);
            expect(minY).toBe(0);
            expect(maxX).toBe(34);
            expect(maxY).toBe(20);

            graphics.destroy();
        });
    });

    describe('fill triangles', () =>
    {
        it('should build fill triangles for both blocks, shadow first', () =>
        {
            const graphics = createOffsetGraphics();
            const gpuContext = buildGeometry(graphics);

            expect(gpuContext.geometryData.vertices).toEqual([
                // dark block corners
                34, 20, 74, 20, 34, 40, 74, 40,
                // white block corners
                10, 10, 50, 10, 10, 30, 50, 30,
            ]);
            expect(gpuContext.geometryData.indices).toEqual([
                0, 1, 2, 1, 3, 2,
                4, 5, 6, 5, 7, 6,
            ]);
            expect(gpuContext.batches.map((batch) => batch.baseColor)).toEqual([0x202020, 0xffffff]);

            graphics.destroy();
        });
    });

    describe('hit testing', () =>
    {
        it('should hit the white block and nothing else before the shadow is added', () =>
        {
            const graphics = new Graphics()
                .rect(10, 10, 40, 20)
                .fill('#ffffff');

            expect(graphics.containsPoint({ x: 20, y: 20 })).toBe(true);
            expect(graphics.containsPoint({ x: 60, y: 35 })).toBe(false);
            expect(graphics.containsPoint({ x: 70, y: 15 })).toBe(false);

            graphics.destroy();
        });

        it('should hit the white block but never the shadow', () =>
        {
            const graphics = createOffsetGraphics();

            // covered by a white triangle
            expect(graphics.containsPoint({ x: 20, y: 20 })).toBe(true);
            // covered by a dark triangle only — the shadow never hit tests
            expect(graphics.containsPoint({ x: 60, y: 35 })).toBe(false);
            // covered by neither color
            expect(graphics.containsPoint({ x: 70, y: 15 })).toBe(false);

            graphics.destroy();
        });

        it('should hit the origin block but never its shadow', () =>
        {
            const graphics = new Graphics()
                .rect(0, 0, 10, 10)
                .fill('#ffffff')
                .addOffsetShadow(24, 10, '#202020');

            expect(graphics.containsPoint({ x: 5, y: 5 })).toBe(true);
            expect(graphics.containsPoint({ x: 30, y: 15 })).toBe(false);

            graphics.destroy();
        });
    });

    describe('svg export', () =>
    {
        it('should export both blocks, shadow first', () =>
        {
            const graphics = createOffsetGraphics();

            expect(graphicsContextToSvg(graphics)).toBe(OFFSET_SVG);

            graphics.destroy();
        });

        it('should export the origin block with its shadow', () =>
        {
            const graphics = new Graphics()
                .rect(0, 0, 10, 10)
                .fill('#ffffff')
                .addOffsetShadow(24, 10, '#202020');

            expect(graphicsContextToSvg(graphics)).toBe(ORIGIN_OFFSET_SVG);

            graphics.destroy();
        });

        it('should work directly on a GraphicsContext', () =>
        {
            const context = new GraphicsContext();

            context.rect(10, 10, 40, 20).fill('#ffffff');

            expect(graphicsContextToSvg(context)).toBe(WHITE_ONLY_SVG);

            context.addOffsetShadow(24, 10, '#202020');

            expect(graphicsContextToSvg(context)).toBe(OFFSET_SVG);
            expect(context.containsPoint({ x: 20, y: 20 })).toBe(true);
            expect(context.containsPoint({ x: 60, y: 35 })).toBe(false);

            context.destroy();
        });
    });

    describe('canvas drawing', () =>
    {
        it('should draw the shadow corners before the white block', () =>
        {
            const graphics = createOffsetGraphics();
            const adaptor = new CanvasGraphicsAdaptor();
            const drawnRects: { rect: number[], style: string }[] = [];

            let currentRect: number[] = null;
            let currentStyle = '';

            const noop = (): void => undefined;

            const context2d = {
                save: noop,
                restore: noop,
                beginPath: () =>
                {
                    currentRect = null;
                },
                rect: (x: number, y: number, w: number, h: number) =>
                {
                    currentRect = [x, y, w, h];
                },
                fill: () =>
                {
                    drawnRects.push({ rect: currentRect, style: currentStyle });
                },
                transform: noop,
                globalAlpha: 1,
                set fillStyle(value: string)
                {
                    currentStyle = value;
                },
                get fillStyle()
                {
                    return currentStyle;
                },
            };

            const renderer = {
                canvasContext: {
                    activeContext: context2d,
                    setContextTransform: noop,
                    setBlendMode: noop,
                },
                globalUniforms: { globalUniformData: { worldColor: 0xFFFFFFFF } },
                filter: null as null,
                _roundPixels: 0,
            };

            adaptor.execute({ renderer } as unknown as GraphicsPipeLike, graphics);

            // the dark block is drawn first, the white block on top of it
            expect(drawnRects).toEqual([
                { rect: [34, 20, 40, 20], style: '#202020' },
                { rect: [10, 10, 40, 20], style: '#ffffff' },
            ]);

            graphics.destroy();
        });

        it('should render the shadow beneath the white block in canvas pixels', async () =>
        {
            const { CanvasRenderer } = await import('~/rendering');

            const renderer = new CanvasRenderer();

            await renderer.init({ width: 80, height: 50, backgroundAlpha: 0 });

            const graphics = createOffsetGraphics();

            try
            {
                renderer.render({ container: graphics });

                const context = renderer.canvas.getContext('2d') as CanvasRenderingContext2D;
                const pixel = (x: number, y: number) => Array.from(context.getImageData(x, y, 1, 1).data);

                expect(pixel(20, 20)).toEqual([255, 255, 255, 255]); // white block
                expect(pixel(40, 25)).toEqual([255, 255, 255, 255]); // overlap — white covers the shadow
                expect(pixel(60, 35)).toEqual([32, 32, 32, 255]); // shadow only
                expect(pixel(70, 15)).toEqual([0, 0, 0, 0]); // neither color
            }
            finally
            {
                graphics.destroy();
                renderer.destroy();
            }
        });
    });

    describe('removeOffsetShadow', () =>
    {
        it('should restore the original block when the shadow is removed', () =>
        {
            const graphics = createOffsetGraphics();

            graphics.removeOffsetShadow();

            const { minX, minY, maxX, maxY } = graphics.bounds;

            expect(minX).toBe(10);
            expect(minY).toBe(10);
            expect(maxX).toBe(50);
            expect(maxY).toBe(30);

            expect(graphicsContextToSvg(graphics)).toBe(WHITE_ONLY_SVG);

            expect(graphics.containsPoint({ x: 20, y: 20 })).toBe(true);
            expect(graphics.containsPoint({ x: 60, y: 35 })).toBe(false);

            // no dark triangles remain
            const gpuContext = buildGeometry(graphics);

            expect(gpuContext.geometryData.vertices).toEqual([
                10, 10, 50, 10, 10, 30, 50, 30,
            ]);
            expect(gpuContext.batches.map((batch) => batch.baseColor)).toEqual([0xffffff]);

            graphics.destroy();
        });

        it('should be a no-op when no shadow was added', () =>
        {
            const graphics = new Graphics()
                .rect(10, 10, 40, 20)
                .fill('#ffffff');

            graphics.removeOffsetShadow();

            expect(graphicsContextToSvg(graphics)).toBe(WHITE_ONLY_SVG);

            graphics.destroy();
        });
    });
});

describe('GraphicsPath translate', () =>
{
    it('should bake the offset into rect and path command coordinates', () =>
    {
        const path = new GraphicsPath();

        path.rect(10, 10, 40, 20);
        path.moveTo(0, 0).lineTo(5, 5);

        path.translate(24, 10);

        const [rectInst, moveInst, lineInst] = path.instructions;

        expect(rectInst.data.slice(0, 4)).toEqual([34, 20, 40, 20]);
        expect(moveInst.data.slice(0, 2)).toEqual([24, 10]);
        expect(lineInst.data.slice(0, 2)).toEqual([29, 15]);
    });

    it('should prepend the offset to a non-identity shape transform', () =>
    {
        const path = new GraphicsPath();
        const transform = new Matrix().scale(2, 2);

        path.rect(10, 10, 40, 20, transform);
        path.translate(24, 10);

        const data = path.instructions[0].data;

        // coordinates are untouched, the transform carries the offset
        expect(data.slice(0, 4)).toEqual([10, 10, 40, 20]);

        const matrix = data[4] as Matrix;

        expect(matrix.a).toBe(2);
        expect(matrix.tx).toBe(24);
        expect(matrix.ty).toBe(10);

        // the original matrix is left alone
        expect(transform.tx).toBe(0);
        expect(transform.ty).toBe(0);
    });

    it('should translate polygon points without mutating the source array', () =>
    {
        const points = [0, 0, 10, 0, 10, 10];
        const path = new GraphicsPath();

        path.poly(points, true);
        path.translate(24, 10);

        const [polyInst] = path.instructions;

        expect(polyInst.data[0]).toEqual([24, 10, 34, 10, 34, 20]);
        expect(points).toEqual([0, 0, 10, 0, 10, 10]);
    });
});
