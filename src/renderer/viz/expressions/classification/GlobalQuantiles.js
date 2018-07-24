import Classifier from './Classifier';
import Property from '../basic/property';
import { checkNumber, checkInstance, checkType } from '../utils';

/**
 * Classify `input` by using the quantiles method with `n` buckets.
 *
 * It will classify the input based on the entire dataset without filtering by viewport or by `filter`.
 *
 * @param {Number} input - The input expression used in the quantiles
 * @param {number} n - Number of buckets to be returned
 * @return {Category}
 *
 * @example <caption>Use global quantiles to define a color ramp.</caption>
 * const s = carto.expressions;
 * const viz = new carto.Viz({
 *   color: s.ramp(s.globalQuantiles(s.prop('density'), 5), s.palettes.PRISM)
 * });
 *
 * @example <caption>Use global quantiles to define a color ramp. (String)</caption>
 * const viz = new carto.Viz(`
 *   color: ramp(globalQuantiles($density, 5), PRISM)
 * `);
 *
 * @memberof carto.expressions
 * @name globalQuantiles
 * @function
 * @api
 */
export default class GlobalQuantiles extends Classifier {
    constructor (input, buckets) {
        checkInstance('globalQuantiles', 'input', 0, Property, input && (input.property || input));
        checkNumber('globalQuantiles', 'buckets', 1, buckets);
        super({ input }, buckets);
    }

    _compile (metadata) {
        super._compile(metadata);
        const copy = metadata.sample.map(s => s[this.input.name]);
        checkType('globalQuantiles', 'input', 0, 'number', this.input);

        copy.sort((x, y) => x - y);

        this.breakpoints.map((breakpoint, index) => {
            const p = (index + 1) / this.buckets;
            breakpoint.expr = copy[Math.floor(p * copy.length)];
        });
    }
}
