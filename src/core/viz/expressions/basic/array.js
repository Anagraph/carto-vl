import BaseExpression from '../base';
import { checkExpression, implicitCast } from '../utils';

/**
 * Wrapper around arrays.
 *
 * @param {Number[]|String[]|Color[]|Date[]} elements
 * @returns {Array}
 *
 * @memberof carto.expressions
 * @name array
 * @function
 * @IGNOREapi
 */
export default class BaseArray extends BaseExpression {
    constructor(elems) {
        elems = elems || [];
        if (!Array.isArray(elems)) {
            elems = [elems];
        }
        elems = elems.map(implicitCast);
        if (!elems.length) {
            throw new Error('array(): invalid parameters: must receive at least one argument');
        }
        let type = '';
        for (let elem of elems) {
            type = elem.type;
            if (elem.type != undefined) {
                break;
            }
        }
        if (['number', 'string', 'color', 'time', undefined].indexOf(type) == -1) {
            throw new Error(`array(): invalid parameters type: ${type}`);
        }
        elems.map((item, index) => {
            checkExpression('array', `item[${index}]`, index, item);
            if (item.type != type && item.type != undefined) {
                throw new Error('array(): invalid parameters, invalid argument type combination');
            }
        });
        super({});
        this.type = type + '-array';
        this.expr = elems;
        try {
            this.expr.map(c => c.value);
        } catch (error) {
            throw new Error('Arrays must be formed by constant expressions, they cannot depend on feature properties');
        }
    }
    get value() {
        return this.expr.map(c => c.value);
    }
    eval() {
        return this.expr.map(c => c.eval());
    }
    _resolveAliases(aliases) {
        this.expr.map(c => c._resolveAliases(aliases));
    }
}
