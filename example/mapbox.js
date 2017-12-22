import * as MGL from '../contrib/mapboxgl';
import WindshaftSQL from '../contrib/windshaft-sql';
import * as R from '../src/index';

const styles = [
    `width: 3
color: rgba(0.8,0,0,1)`,

    `width: 3
color: rgba(0.8,0,0,0.2)`,

    `width: 3
color: hsv(0, 0, 1)`,

    `width: 3
color: hsv(0, 0.7, 1.)`,

    `width: 3
color: hsv(0.2, 0.7, 1.)`,

    `width: 3
color: hsv(0.7, 0.7, 1.)`,

    `width: 3
color: hsv($category/10, 0.7, 1.)`,

    `width: 3
color: ramp($category, Prism)`,

    `width: 3
color: ramp(top($category, 4), Prism)`,

    `width: 3
color: setOpacity( ramp($category, Prism), $amount/5000)`,

    `width: 3
color: ramp($category, Prism)`,

    `width: sqrt($amount/5000)*20
color: ramp($category, Prism)`,

    `width: sqrt($amount/5000)*20*(zoom()/4000+0.01)*1.5
color: ramp($category, Prism)`,

    `width: sqrt($amount/5000)*20*(zoom()/4000+0.01)*1.5
color: ramp($category, Prism)
strokeColor:       rgba(0,0,0,0.7)
strokeWidth:      2*zoom()/50000`,

    `width: sqrt(SUM($amount)/50000)*20*(zoom()/4000+0.01)*1.5
color: ramp(MODE($category), Prism)
strokeColor:       rgba(0,0,0,0.7)
strokeWidth:      2*zoom()/50000`,
];

const texts = [
    `We can use RGBA colors`,

    `This means that we can change the opacity (alpha) easily`,

    `There is support for other color spaces like HSV (Hue, Saturation, Value)`,

    `Hue, Saturation and Value are defined in the [0,1] range, the hue is wrapped (cylindrical space)`,
    `Hue, Saturation and Value are defined in the [0,1] range, the hue is wrapped (cylindrical space)`,
    `Hue, Saturation and Value are defined in the [0,1] range, the hue is wrapped (cylindrical space)`,

    `You can mix expressions. Here we are setting the hue based on the category of each feature`,

    `We can use turbo-carto inspired ramps too`,

    `We can select the top categories, by grouping the rest into the 'others' buckets`,

    `We can normalize the map based on the amount property by changing the opacity`,

    `But, let's go back a little bit...`,

    `We can create a bubble map easily, and we can use the square root to make the circle's area proportional to the feature's property`,

    `We can make them proportional to the scale too, to avoid not very attractive overlaps`,

    `And... let's put a nice stroke`,
    `Finally, we can use the new Windshaft aggregations, just use the aggregator functions: MIN, MAX, SUM, AVG and MODE`,
];

const shipsStyle = 'width:    blend(1,2,near($day, (25*now()) %1000, 0, 10), cubic) *zoom()\ncolor:    setopacity(ramp(AVG($temp), tealrose, 0, 30), blend(0.005,1,near($day, (25*now()) %1000, 0, 10), cubic))';

const barcelonaQueries = [`(SELECT
        *
    FROM tx_0125_copy_copy) AS tmp`
    ,
    (x, y, z) => `select st_asmvt(geom, 'lid') FROM
(
    SELECT
        ST_AsMVTGeom(
            ST_SetSRID(ST_MakePoint(avg(ST_X(the_geom_webmercator)), avg(ST_Y(the_geom_webmercator))),3857),
            CDB_XYZ_Extent(${x},${y},${z}), 1024, 0, false
        ),
        SUM(amount) AS amount,
        _cdb_mode(category) AS category
    FROM tx_0125_copy_copy AS cdbq
    WHERE the_geom_webmercator && CDB_XYZ_Extent(${x},${y},${z})
    GROUP BY ST_SnapToGrid(the_geom_webmercator, CDB_XYZ_Resolution(${z})*0.25)
    ORDER BY amount DESC
)AS geom`];

const ships_WWIQueries = [`(SELECT
            the_geom_webmercator,
            temp,
            DATE_PART('day', date::timestamp-'1912-12-31 01:00:00'::timestamp )::numeric AS day
        FROM wwi_ships) AS tmp`
    ,
    (x, y, z) => `select st_asmvt(geom, 'lid') FROM
    (
        SELECT
            ST_AsMVTGeom(
                ST_SetSRID(ST_MakePoint(avg(ST_X(the_geom_webmercator)), avg(ST_Y(the_geom_webmercator))),3857),
                CDB_XYZ_Extent(${x},${y},${z}), 1024, 0, false
            ),
            AVG(temp)::numeric(3,1) AS temp,
            DATE_PART('day', date::timestamp-'1912-12-31 01:00:00'::timestamp )::smallint AS day
        FROM wwi_ships AS cdbq
        WHERE the_geom_webmercator && CDB_XYZ_Extent(${x},${y},${z})
        GROUP BY ST_SnapToGrid(the_geom_webmercator, CDB_XYZ_Resolution(${z})*0.25),
            DATE_PART('day', date::timestamp-'1912-12-31 01:00:00'::timestamp )
    )AS geom
`];

var mapboxgl = window.mapboxgl;
mapboxgl.accessToken = 'pk.eyJ1IjoiZG1hbnphbmFyZXMiLCJhIjoiY2o5cHRhOGg5NWdzbTJxcXltb2g2dmE5NyJ9.RVto4DnlLzQc26j9H0g9_A';
var map = new mapboxgl.Map({
    container: 'map', // container id
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json', // stylesheet location
    center: [2.17, 41.38], // starting position [lng, lat]
    zoom: 13, // starting zoom,
});
map.repaint = false;
var mgl = new MGL.MGLIntegrator(map, WindshaftSQL);

let protoSchema = null;

map.on('load', _ => {
    let index = 0;//styles.length - 1;

    function updateStyle(v) {
        v = v || document.getElementById("styleEntry").value;
        document.getElementById("styleEntry").value = v;
        location.hash = getConfig();
        try {
            const p = R.Style.getSchema(v);
            if (!R.Style.protoSchemaIsEquals(p, protoSchema)) {
                protoSchema = p;
                mgl.provider.setQueries(protoSchema, $('#dataset').val());
            }
            mgl.provider.schema.then(schema => {
                try {
                    const s = R.Style.parseStyle(v, schema);
                    mgl.provider.style.set(s, 1000);
                    document.getElementById("feedback").style.display = 'none';
                } catch (error) {
                    const err = `Invalid style: ${error}:${error.stack}`;
                    console.warn(err);
                    document.getElementById("feedback").value = err;
                    document.getElementById("feedback").style.display = 'block';
                }
            });
        } catch (error) {
            const err = `Invalid style: ${error}:${error.stack}`;
            console.warn(err);
            document.getElementById("feedback").value = err;
            document.getElementById("feedback").style.display = 'block';
        }
    }

    function barcelona() {
        $('.step').css('display', 'inline');
        $('#styleEntry').removeClass('twelve columns').addClass('eight columns');
        $('#tutorial').text(texts[index]);

        $('#dataset').val('tx_0125_copy_copy');
        $('#apikey').val('8a174c451215cb8dca90264de342614087c4ef0c');
        $('#user').val('dmanzanares-ded13');
        $('#cartoURL').val('carto-staging.com');

        document.getElementById("styleEntry").value = styles[index];
        superRefresh();
    }
    function wwi() {
        $('.step').css('display', 'none');
        $('#styleEntry').removeClass('eight columns').addClass('twelve columns');
        $('#tutorial').text('');

        $('#dataset').val('wwi');
        $('#apikey').val('8a174c451215cb8dca90264de342614087c4ef0c');
        $('#user').val('dmanzanares-ded13');
        $('#cartoURL').val('carto-staging.com');

        document.getElementById("styleEntry").value = shipsStyle;
        superRefresh();
    }

    $('#prev').click(() => {
        $("#prev").attr("disabled", false);
        $("#next").attr("disabled", false);
        if (index > 0) {
            index--;
            $('#tutorial').text(texts[index]);
            updateStyle(styles[index]);
        }
        if (index == 0) {
            $("#prev").attr("disabled", true);
        }
    });
    $('#next').click(() => {
        $("#prev").attr("disabled", false);
        $("#next").attr("disabled", false);
        if (index < styles.length - 1) {
            index++;
            $('#tutorial').text(texts[index]);
            updateStyle(styles[index]);
        }
        if (index == styles.length - 1) {
            $("#next").prop("disabled", true);
        }
    });

    $('#barcelona').click(barcelona);
    $('#wwi').click(wwi);
    $('#styleEntry').on('input', () => updateStyle());
    function getConfig() {
        return '#' + btoa(JSON.stringify({
            a: $('#dataset').val(),
            b: $('#apikey').val(),
            c: $('#user').val(),
            d: $('#cartoURL').val(),
            e: $('#styleEntry').val(),
            f: map.getCenter(),
            g: map.getZoom(),
        }));
    }
    function setConfig(input) {
        const c = JSON.parse(atob(input));
        $('#dataset').val(c.a);
        $('#apikey').val(c.b);
        $('#user').val(c.c);
        $('#cartoURL').val(c.d);
        $('#styleEntry').val(c.e);
        map.setCenter(c.f);
        map.setZoom(c.g);

        superRefresh();
    }

    const superRefresh = () => {
        location.hash = getConfig();

        mgl.provider.setCartoURL($('#cartoURL').val());
        mgl.provider.setUser($('#user').val());
        mgl.provider.setApiKey($('#apikey').val());

        localStorage.setItem('cartoURL', $('#cartoURL').val());
        localStorage.setItem('user', $('#user').val());
        localStorage.setItem('apikey', $('#apikey').val());
        localStorage.setItem('dataset', $('#dataset').val());
        protoSchema = null;
        updateStyle();
    };


    $('#dataset').on('input', superRefresh);
    $('#apikey').on('input', superRefresh);
    $('#user').on('input', superRefresh);
    $('#cartoURL').on('input', superRefresh);


    if (localStorage.getItem("dataset")) {
        $('#dataset').val(localStorage.getItem("dataset"));
        $('#apikey').val(localStorage.getItem("apikey"));
        $('#user').val(localStorage.getItem("user"));
        $('#cartoURL').val(localStorage.getItem("cartoURL"));
    }
    if (location.hash.length > 1) {
        setConfig(location.hash.substring(1));
    } else {
        barcelona();
    }
});
