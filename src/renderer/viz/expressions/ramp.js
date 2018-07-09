import BaseExpression from './base';
import { implicitCast, checkLooseType, checkExpression, checkType, clamp, checkInstance } from './utils';
import { interpolate } from '../colorspaces';
import Sprites from './sprites';
import NamedColor from './color/NamedColor';
import Buckets from './buckets';
import Property from './basic/property';
import { Classifier } from './classifier';
import Linear from './linear';

const paletteTypes = {
    PALETTE: 'palette',
    COLOR_ARRAY: 'color-array',
    NUMBER_ARRAY: 'number-array',
    SPRITE: 'sprite'
};

const rampTypes = {
    COLOR: 'color',
    NUMBER: 'number'
};

const inputTypes = {
    NUMBER: 'number',
    CATEGORY: 'category'
};

const COLOR_ARRAY_LENGTH = 256;
const MAX_BYTE_VALUE = 255;

/**
* Create a ramp: a mapping between an input (a numeric or categorical expression) and an output (a color palette or a numeric palette, to create bubble maps)
*
* Categories to colors
* Categorical expressions can be used as the input for `ramp` in combination with color palettes. If the number of categories exceeds the number of available colors in the palette new colors will be generated by
* using CieLAB interpolation.
*
* Categories to numeric
* Categorical expression can be used as the input for `ramp` in combination with numeric palettes. If the number of input categories doesn't match the number of numbers in the numeric palette, linear interpolation will be used.
*
* Numeric expressions to colors
* Numeric expressions can be used as the input for `ramp` in combination with color palettes. Colors will be generated by using CieLAB interpolation.
*
* Numeric expressions to numeric
* Numeric expressions can be used as the input for `ramp` in combination with numeric palettes. Linear interpolation will be used to generate intermediate output values.
*
* @param {Number|Category} input - The input expression to give a color
* @param {Palette|Color[]|Number[]} palette - The color palette that is going to be used
* @return {Number|Color}
*
* @example <caption>Mapping categories to colors and numbers</caption>
* const s = carto.expressions;
* const viz = new carto.Viz({
*   width: s.ramp(s.buckets(s.prop('dn'), [20, 50, 120]), [1, 4, 8])
*   color: s.ramp(s.buckets(s.prop('dn'), [20, 50, 120]), s.palettes.PRISM)
* });
*
* @example <caption>Mapping categories to colors and numbers (String)</caption>
* const viz = new carto.Viz(`
*   width: ramp(buckets($dn, [20, 50, 120]), [1, 10,4])
*   color: ramp(buckets($dn, [20, 50, 120]), prism)
* `);
*
*
* @example <caption>Mapping numeric expressions to colors and numbers</caption>
* const s = carto.expressions;
* const viz = new carto.Viz({
*   width: s.ramp(s.linear(s.prop('dn'), 40, 100), [1, 8])
*   color: s.ramp(s.linear(s.prop('dn'), 40, 100), s.palettes.PRISM)
* });
*
* @example <caption>Mapping numeric expressions to colors and numbers (String)</caption>
* const viz = new carto.Viz(`
*   width: ramp(linear($dn, 40, 100), [1, 10,4])
*   color: ramp(linear($dn, 40, 100), prism)
* `);
*
* @memberof carto.expressions
* @name ramp
* @function
* @api
*/
export default class Ramp extends BaseExpression {
    constructor(input, palette) {
        input = implicitCast(input);
        palette = implicitCast(palette);

        checkExpression('ramp', 'input', 0, input);
        checkLooseType('ramp', 'input', 0, Object.values(inputTypes), input);
        checkLooseType('ramp', 'palette', 1, Object.values(paletteTypes), palette);
        
        if (palette.type === paletteTypes.SPRITE) {
            checkInstance('ramp', 'palette', 1, Sprites, palette);
            checkLooseType('ramp', 'input', 0, inputTypes.CATEGORY, input);
        }

        super({ input: input });
        this.minKey = 0;
        this.maxKey = 1;
        this.palette = palette;
        this.inlineMaker = () => undefined;

        this.type = palette.type === paletteTypes.NUMBER_ARRAY ? rampTypes.NUMBER : rampTypes.COLOR;

        try {
            if (palette.type === paletteTypes.NUMBER_ARRAY) {
                this.palette.floats = this.palette.eval();
            } else if (palette.type === paletteTypes.COLOR_ARRAY) {
                this.palette.colors = this.palette.eval();
            }
        } catch (error) {
            throw new Error('Palettes must be formed by constant expressions, they cannot depend on feature properties');
        }
    }

    loadSprites() {
        return Promise.all([this.input.loadSprites(), this.palette.loadSprites()]);
    }

    _setUID(idGenerator) {
        super._setUID(idGenerator);
        this.palette._setUID(idGenerator);
    }

    eval(feature) {
        const pixelValues = this._computeTextureIfNeeded();
        const input = this.input.eval(feature);

        if (input !== -1) {
            const numValues = pixelValues.length - 1;
            const m = (input - this.minKey) / (this.maxKey - this.minKey);
            
            const color = this.type === rampTypes.NUMBER
                ? this._getValue(pixelValues, numValues, m)
                : this._getColorValue(pixelValues, m);
            
            this._texCategories = null;
            this._GLtexCategories = null;

            return color;
        }

        return null;
    }

    _getValue(pixelValues, numValues, m) {
        const lowIndex = clamp(Math.floor(numValues * m), 0, numValues);
        const highIndex = clamp(Math.ceil(numValues * m), 0, numValues);
        const fract = numValues * m - Math.floor(numValues * m);
        const low = pixelValues[lowIndex];
        const high = pixelValues[highIndex];

        return Math.round(fract * high + (1 - fract) * low);
    }
    
    _getColorValue(pixelValues, m) {
        const index = Math.round(m * MAX_BYTE_VALUE);

        return {
            r: Math.round(pixelValues[index * 4 + 0]),
            g: Math.round(pixelValues[index * 4 + 1]),
            b: Math.round(pixelValues[index * 4 + 2]),
            a: Math.round(pixelValues[index * 4 + 3]) / MAX_BYTE_VALUE
        };
    }
    
    _compile(metadata) {
        super._compile(metadata);

        if (this.input.isA(Property) && this.input.type === inputTypes.NUMBER) {
            this.input = new Linear(this.input); 
            this.input._compile(metadata);
        }

        checkType('ramp', 'input', 0, Object.values(inputTypes), this.input);
        
        if (this.palette.type === paletteTypes.SPRITE) {
            checkType('ramp', 'input', 0, inputTypes.CATEGORY, this.input);
            checkInstance('ramp', 'palette', 1, Sprites, this.palette);
        }
        
        this._texCategories = null;
        this._GLtexCategories = null;
    }

    _free(gl) {
        if (this.texture) {
            gl.deleteTexture(this.texture);
        }
    }

    _applyToShaderSource(getGLSLforProperty) {
        const input = this.input._applyToShaderSource(getGLSLforProperty);

        if (this.palette.type === paletteTypes.SPRITE) {
            const sprites = this.palette._applyToShaderSource(getGLSLforProperty);
            
            return {
                preface: input.preface + sprites.preface,
                inline: `${sprites.inline}(spriteUV, ${input.inline})`
            };
        }

        return {
            preface: this._prefaceCode(input.preface + `
                uniform sampler2D texRamp${this._uid};
                uniform float keyMin${this._uid};
                uniform float keyWidth${this._uid};`
            ),

            inline: this.palette.type === paletteTypes.NUMBER_ARRAY
                ? `(texture2D(texRamp${this._uid}, vec2((${input.inline}-keyMin${this._uid})/keyWidth${this._uid}, 0.5)).a)`
                : `texture2D(texRamp${this._uid}, vec2((${input.inline}-keyMin${this._uid})/keyWidth${this._uid}, 0.5)).rgba`
        };
    }
    
    _getColorsFromPalette(input, palette) {
        if (palette.type === paletteTypes.SPRITE) {
            return palette.colors;
        }

        const othersColor = new NamedColor('gray');
        return palette.type === paletteTypes.PALETTE
            ? _getColorsFromPaletteType(input, palette, this.maxKey, othersColor.eval())
            : _getColorsFromColorArrayType(input, palette, this.maxKey, othersColor.eval());
    }
    
    _postShaderCompile(program, gl) {
        if (this.palette.type === paletteTypes.SPRITE) {
            this.palette._postShaderCompile(program, gl);
            super._postShaderCompile(program, gl);
            return;
        }

        this.input._postShaderCompile(program, gl);
        this._getBinding(program).texLoc = gl.getUniformLocation(program, `texRamp${this._uid}`);
        this._getBinding(program).keyMinLoc = gl.getUniformLocation(program, `keyMin${this._uid}`);
        this._getBinding(program).keyWidthLoc = gl.getUniformLocation(program, `keyWidth${this._uid}`);
    }

    _computeTextureIfNeeded() {
        if (this._texCategories !== this.input.numCategories) {
            this._texCategories = this.input.numCategories;

            if (this.input.type === inputTypes.CATEGORY) {
                this.maxKey = this.input.numCategories - 1;
            }

            return this.type === rampTypes.COLOR
                ? this._computeTextureColor()
                : this._computeTexture();
        }

        return [];
    }

    _computeTextureColor() {
        const pixelValues = new Uint8Array(4 * COLOR_ARRAY_LENGTH);
        const colors = this._getColorsFromPalette(this.input, this.palette);

        for (let i = 0; i < COLOR_ARRAY_LENGTH; i++) {
            const vlowRaw = colors[Math.floor(i / (COLOR_ARRAY_LENGTH - 1) * (colors.length - 1))];
            const vhighRaw = colors[Math.ceil(i / (COLOR_ARRAY_LENGTH - 1) * (colors.length - 1))];
            const vlow = [vlowRaw.r / MAX_BYTE_VALUE, vlowRaw.g / MAX_BYTE_VALUE, vlowRaw.b / MAX_BYTE_VALUE, vlowRaw.a];
            const vhigh = [vhighRaw.r / MAX_BYTE_VALUE, vhighRaw.g / MAX_BYTE_VALUE, vhighRaw.b / MAX_BYTE_VALUE, vhighRaw.a];
            const m = i / (COLOR_ARRAY_LENGTH - 1) * (colors.length - 1) - Math.floor(i / (COLOR_ARRAY_LENGTH - 1) * (colors.length - 1));
            const v = interpolate({ r: vlow[0], g: vlow[1], b: vlow[2], a: vlow[3] }, { r: vhigh[0], g: vhigh[1], b: vhigh[2], a: vhigh[3] }, m);

            pixelValues[4 * i + 0] = Math.round(v.r * MAX_BYTE_VALUE);
            pixelValues[4 * i + 1] = Math.round(v.g * MAX_BYTE_VALUE);
            pixelValues[4 * i + 2] = Math.round(v.b * MAX_BYTE_VALUE);
            pixelValues[4 * i + 3] = Math.round(v.a * MAX_BYTE_VALUE);
        }

        return pixelValues;
    }

    _computeTexture() {
        const pixelValues = new Float32Array(COLOR_ARRAY_LENGTH);
        const floats = this.palette.floats;

        for (let i = 0; i < COLOR_ARRAY_LENGTH; i++) {
            const vlowRaw = floats[Math.floor(i / MAX_BYTE_VALUE * (floats.length - 1))];
            const vhighRaw = floats[Math.ceil(i / MAX_BYTE_VALUE * (floats.length - 1))];
            const m = i / MAX_BYTE_VALUE * (floats.length - 1) - Math.floor(i / MAX_BYTE_VALUE * (floats.length - 1));
            pixelValues[i] = ((1. - m) * vlowRaw + m * vhighRaw);
        }

        return pixelValues;
    }

    _computeGLTextureIfNeeded(gl) {
        const pixelValues = this._computeTextureIfNeeded();

        if (this._GLtexCategories !== this.input.numCategories) {
            this._GLtexCategories = this.input.numCategories;

            this.texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            
            if (this.type === rampTypes.COLOR) {
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, COLOR_ARRAY_LENGTH, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixelValues);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            } else {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, COLOR_ARRAY_LENGTH, 1, 0, gl.ALPHA, gl.FLOAT, pixelValues);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            }

            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        }
    }

    _preDraw(program, drawMetadata, gl) {
        this.input._preDraw(program, drawMetadata, gl);

        if (this.palette.type === paletteTypes.SPRITE) {
            this.palette._preDraw(program, drawMetadata, gl);
            return;
        }

        gl.activeTexture(gl.TEXTURE0 + drawMetadata.freeTexUnit);
        this._computeGLTextureIfNeeded(gl);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.uniform1i(this._getBinding(program).texLoc, drawMetadata.freeTexUnit);
        gl.uniform1f(this._getBinding(program).keyMinLoc, (this.minKey));
        gl.uniform1f(this._getBinding(program).keyWidthLoc, (this.maxKey) - (this.minKey));
        drawMetadata.freeTexUnit++;
    }
}

function _getColorsFromPaletteType(input, palette, numCategories, othersColor) {
    return input.isA(Buckets)
        ? _getColorsFromPaletteTypeBuckets(palette, numCategories, othersColor)
        : _getColorsFromPaletteTypeDefault(input, palette, numCategories, othersColor);
}

function _getColorsFromPaletteTypeBuckets(palette, numCategories, othersColor) {
    let colors;
    
    if (palette.isQuantitative()) {
        colors = _getSubPalettes(palette, numCategories);
        colors.push(othersColor);
    }

    if (palette.isQualitative()) {
        colors = _getSubPalettes(palette, numCategories);
        othersColor = colors[numCategories];
    }

    return _avoidShowingInterpolation(numCategories, colors, othersColor);
}

function _getColorsFromPaletteTypeDefault(input, palette, numCategories, othersColor) {
    let colors;

    if (palette.isQuantitative()) {
        colors = _getSubPalettes(palette, input.numCategories);
    }

    if (palette.isQualitative()) {
        colors = _getSubPalettes(palette, numCategories);
        
        if (input.numCategories === numCategories) {
            colors.pop();
            othersColor = colors[numCategories];
        }
    }

    if (input.numCategories === undefined) {
        return colors;
    }

    return _avoidShowingInterpolation(input.numCategories, colors, othersColor);
}

function _getSubPalettes(palette, numCategories) {
    const colors = palette.subPalettes[numCategories]
        ? palette.subPalettes[numCategories]
        : palette.getLongestSubPalette();
    
    return colors;
}

function _getColorsFromColorArrayType(input, palette, numCategories, othersColor) {
    return input.type === inputTypes.CATEGORY
        ? _getColorsFromColorArrayTypeCategorical(input, numCategories, palette.colors, othersColor)
        : _getColorsFromColorArrayTypeNumeric(input.numCategories, palette.colors);
}

function _getColorsFromColorArrayTypeCategorical(input, numCategories, colors, othersColor) {
    let otherColor;

    if (input.isA(Classifier) && numCategories < colors.length) {
        return colors;
    }

    if (input.isA(Property)) {
        return colors;
    }

    if (numCategories < colors.length) {
        otherColor = colors[numCategories];
    } 

    if (numCategories >= colors.length) {
        otherColor = othersColor;
        colors = _addOtherColorToColors(colors, otherColor);
    }
    
    return _avoidShowingInterpolation(numCategories, colors, otherColor);
}

function _getColorsFromColorArrayTypeNumeric(numCategories, colors) {
    let otherColor;
    
    if (numCategories < colors.length) {
        otherColor = colors[numCategories];
        return _avoidShowingInterpolation(numCategories, colors, otherColor);
    } 

    if (numCategories === colors.length) {
        otherColor = colors[colors.length - 1];
        return _avoidShowingInterpolation(numCategories, colors, otherColor);
    }
    
    return colors;
}

function _addOtherColorToColors (colors, otherColor) {
    return [...colors, otherColor];
}

function _avoidShowingInterpolation(numCategories, colors, othersColor) {
    const colorArray = [];

    for (let i = 0; i < colors.length; i++) {
        if (i < numCategories) {
            colorArray.push(colors[i]);
        } else if (i === numCategories) {
            colorArray.push(othersColor);
        }
    }

    return colorArray;
}
