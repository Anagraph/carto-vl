import * as s from '../../../../../../src/renderer/viz/expressions';
import Metadata from '../../../../../../src/renderer/Metadata';
import { validateMaxArgumentsError } from '../utils';

describe('src/renderer/viz/expressions/viewportAggregation', () => {
    describe('error control', () => {
        validateMaxArgumentsError('viewportMax', ['number', 'number']);
        validateMaxArgumentsError('viewportMin', ['number', 'number']);
        validateMaxArgumentsError('viewportSum', ['number', 'number']);
        validateMaxArgumentsError('viewportAvg', ['number', 'number']);
        validateMaxArgumentsError('viewportCount', ['number', 'number']);
        validateMaxArgumentsError('viewportPercentile', ['number', 'number', 'number']);
        validateMaxArgumentsError('viewportHistogram', ['number', 'number', 'number', 'number']);
    });

    const $price = s.property('price');
    const $nulls = s.property('numeric_with_nulls');
    const $cat = s.property('cat');

    describe('viewport filtering', () => {
        function fakeDrawMetadata (expr) {
            const METADATA = new Metadata({
                properties: {
                    numeric_with_nulls: { type: 'number' },
                    price: { type: 'number' },
                    cat: {
                        type: 'category',
                        categories: [
                            { name: 'a' },
                            { name: 'b' },
                            { name: 'c' }
                        ]
                    }
                }
            });

            expr._bindMetadata(METADATA);
            expr._resetViewportAgg(METADATA);
            expr.accumViewportAgg({ price: 1.5, cat: 'b', numeric_with_nulls: NaN });
            expr.accumViewportAgg({ price: 2, cat: 'c', numeric_with_nulls: 2 });
            expr.accumViewportAgg({ price: 0.5, cat: 'b', numeric_with_nulls: 1 });
            expr.accumViewportAgg({ price: 0, cat: 'a', numeric_with_nulls: 0 });
        }

        describe('viewportMin()', () => {
            it('($price) should return the metadata min', () => {
                const viewportMin = s.viewportMin($price);
                fakeDrawMetadata(viewportMin);
                expect(viewportMin.eval()).toEqual(0);
            });

            it('($nulls) should return the metadata min', () => {
                const viewportMin = s.viewportMin($nulls);
                fakeDrawMetadata(viewportMin);
                expect(viewportMin.eval()).toEqual(0);
            });
        });

        describe('viewportAvg()', () => {
            it('($price) should return the metadata avg', () => {
                const viewportAvg = s.viewportAvg($price);
                fakeDrawMetadata(viewportAvg);
                expect(viewportAvg.eval()).toEqual(1);
            });

            it('($nulls) should return the metadata avg', () => {
                const viewportAvg = s.viewportAvg($nulls);
                fakeDrawMetadata(viewportAvg);
                expect(viewportAvg.eval()).toEqual(1);
            });
        });

        describe('viewportMax', () => {
            it('($price) should return the metadata max', () => {
                const viewportMax = s.viewportMax($price);
                fakeDrawMetadata(viewportMax);
                expect(viewportMax.eval()).toEqual(2);
            });

            it('($nulls) should return the metadata max', () => {
                const viewportMax = s.viewportMax($nulls);
                fakeDrawMetadata(viewportMax);
                expect(viewportMax.eval()).toEqual(2);
            });
        });

        describe('viewportSum', () => {
            it('($price) should return the metadata sum', () => {
                const viewportSum = s.viewportSum($price);
                fakeDrawMetadata(viewportSum);
                expect(viewportSum.eval()).toEqual(4);
            });

            it('($nulls) should return the metadata sum', () => {
                const viewportSum = s.viewportSum($nulls);
                fakeDrawMetadata(viewportSum);
                expect(viewportSum.eval()).toEqual(3);
            });
        });

        describe('viewportCount', () => {
            it('($price) should return the metadata count', () => {
                const viewportCount = s.viewportCount($price);
                fakeDrawMetadata(viewportCount);
                expect(viewportCount.eval()).toEqual(4);
            });

            it('($nulls) should return the metadata count', () => {
                const viewportCount = s.viewportCount($nulls);
                fakeDrawMetadata(viewportCount);
                expect(viewportCount.eval()).toEqual(4);
            });
        });

        it('viewportPercentile($price) should return the metadata count', () => {
            let viewportPercentile;

            viewportPercentile = s.viewportPercentile($price, 0);
            fakeDrawMetadata(viewportPercentile);
            expect(viewportPercentile.value).toEqual(0);

            viewportPercentile = s.viewportPercentile($price, 24);
            fakeDrawMetadata(viewportPercentile);
            expect(viewportPercentile.value).toEqual(0);
            viewportPercentile = s.viewportPercentile($price, 26);
            fakeDrawMetadata(viewportPercentile);
            expect(viewportPercentile.value).toEqual(0.5);

            viewportPercentile = s.viewportPercentile($price, 49);
            fakeDrawMetadata(viewportPercentile);
            expect(viewportPercentile.value).toEqual(0.5);
            viewportPercentile = s.viewportPercentile($price, 51);
            fakeDrawMetadata(viewportPercentile);
            expect(viewportPercentile.value).toEqual(1.5);

            viewportPercentile = s.viewportPercentile($price, 74);
            fakeDrawMetadata(viewportPercentile);
            expect(viewportPercentile.value).toEqual(1.5);
            viewportPercentile = s.viewportPercentile($price, 76);
            fakeDrawMetadata(viewportPercentile);
            expect(viewportPercentile.value).toEqual(2);

            viewportPercentile = s.viewportPercentile($price, 100);
            fakeDrawMetadata(viewportPercentile);
            expect(viewportPercentile.value).toEqual(2);
        });

        it('viewportHistogram($price, 1, 3) should eval to the correct histogram', () => {
            const viewportHistogram = s.viewportHistogram($price, 1, 3);
            fakeDrawMetadata(viewportHistogram);
            expect(viewportHistogram.value).toEqual([
                {
                    x: [0, 2 / 3],
                    y: 2
                },
                {
                    x: [2 / 3, 4 / 3],
                    y: 0
                },
                {
                    x: [4 / 3, 2],
                    y: 2
                }
            ]);
        });

        it('viewportHistogram($cat) should eval to the correct histogram', () => {
            const viewportHistogram = s.viewportHistogram($cat);
            fakeDrawMetadata(viewportHistogram);
            expect(viewportHistogram.value).toEqual([
                {
                    x: 'b',
                    y: 2
                },
                {
                    x: 'a',
                    y: 1
                },
                {
                    x: 'c',
                    y: 1
                }
            ]);
        });
    });
});
