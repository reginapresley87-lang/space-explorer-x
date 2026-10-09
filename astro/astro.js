/* Astro – free, offline space-guide answer engine for Space Explorer X.
 * window.ASTRO = { questions(name), answer(name, question), ask(name, freeText), speak(text), stop(), ready }
 * Numbers come from ../planets.json (or SE.getPlanets()); atmosphere / gravity / temperature
 * come from the curated NASA-sourced table below. Everything is synchronous once planets.json is loaded.
 * Events on window: 'astro:speaking' {detail:{text}}, 'astro:done' {detail:{text}} */
(function () {
  'use strict';
  var BASE = new URL('..', (document.currentScript && document.currentScript.src) || location.href);
  var EARTH_R = 6371, AU_KM = 149597871, EARTH_G = 9.81, KID_KG = 30;
  var DATA = null;

  // ---- curated facts (NASA Planetary Fact Sheets / NASA Science solar-system pages) ----
  // g: surface gravity m/s^2 (cloud-top for giants). temp: kid-friendly temperature text.
  // air: what the "air" is. solid: has a surface you could stand on. rings: ring text (giants).
  var F = {
    Sun:      { g: 274, temp: 'The surface is about 5,500 °C, and the core is about 15 million °C!', air: 'The Sun has no air at all – it is a giant ball of super-hot glowing gas (plasma), mostly hydrogen and helium.', solid: false },
    Mercury:  { g: 3.7, temp: 'Daytime reaches about 430 °C – hot enough to melt lead – but nights drop to about -180 °C, because there is almost no air to hold the heat.', air: 'Mercury has almost no air – just a super-thin wisp of oxygen, sodium, hydrogen, helium and potassium atoms.' },
    Venus:    { g: 8.87, temp: 'About 465 °C everywhere, day and night – the hottest planet, even hotter than Mercury!', air: 'The air is about 96% carbon dioxide with clouds of sulfuric acid, and it presses down 92 times harder than Earth\'s air.' },
    Earth:    { g: 9.81, temp: 'Earth averages a comfy 15 °C, from about -89 °C in Antarctica to about 57 °C in the hottest deserts.', air: 'Yes! Earth\'s air is about 78% nitrogen and 21% oxygen – perfect for breathing.', breathe: true },
    Moon:     { g: 1.62, temp: 'In sunlight it reaches about 120 °C, and at night it drops to about -130 °C.', air: 'The Moon has almost no air at all, so astronauts need spacesuits.' },
    Mars:     { g: 3.71, temp: 'Mars is cold: about -60 °C on average, from about -153 °C at the poles in winter up to about 20 °C on a summer afternoon.', air: 'The air is about 95% carbon dioxide and less than 1% as thick as Earth\'s – no oxygen to breathe.' },
    Phobos:   { g: 0.0057, temp: 'With no air to hold heat, it goes from about -112 °C on the dark side to about -4 °C in sunshine.', air: 'Phobos has no air at all.' },
    Deimos:   { g: 0.003, temp: 'With no air to hold heat, it is far below freezing in the dark and only reaches around freezing in sunshine.', air: 'Deimos has no air at all.' },
    Jupiter:  { g: 24.79, temp: 'The cloud tops are about -110 °C, but deep inside it gets hotter than the surface of the Sun.', air: 'Jupiter is mostly hydrogen (about 90%) and helium (about 10%) – no oxygen to breathe.', solid: false, rings: 'Yes! Jupiter has thin, faint rings made of dust – much harder to see than Saturn\'s.' },
    Io:       { g: 1.80, temp: 'The surface is about -130 °C, but its volcanoes blast out lava hotter than 1,600 °C!', air: 'Io has only a super-thin layer of sulfur dioxide gas from its volcanoes.' },
    Europa:   { g: 1.31, temp: 'Brrr! The icy surface is about -160 °C at the equator and colder than -200 °C at the poles.', air: 'Europa has only a super-thin wisp of oxygen – far too thin to breathe.' },
    Ganymede: { g: 1.43, temp: 'The icy surface ranges from about -200 °C to about -120 °C.', air: 'Ganymede has only a super-thin wisp of oxygen – far too thin to breathe.' },
    Callisto: { g: 1.24, temp: 'The surface is about -140 °C on average.', air: 'Callisto has only a super-thin wisp of carbon dioxide and oxygen.' },
    Saturn:   { g: 10.44, temp: 'The cloud tops are about -140 °C.', air: 'Saturn is mostly hydrogen with some helium – no oxygen to breathe.', solid: false, rings: 'Yes! Saturn has the biggest, brightest rings in the solar system, made of billions of chunks of ice and rock.' },
    Mimas:    { g: 0.064, temp: 'Super cold: about -200 °C.', air: 'Mimas has no air.' },
    Enceladus:{ g: 0.113, temp: 'About -200 °C – it is one of the shiniest, coldest worlds because its fresh ice reflects most sunlight.', air: 'Enceladus has no real air, but it shoots giant geysers of water vapor and ice into space from its south pole.' },
    Tethys:   { g: 0.146, temp: 'Super cold: about -187 °C, with no air to keep it warm.', air: 'Tethys has no air.' },
    Dione:    { g: 0.232, temp: 'Super cold: about -186 °C, with no air to keep it warm.', air: 'Dione has only a super-thin trace of oxygen – no air to breathe.' },
    Rhea:     { g: 0.264, temp: 'Between about -174 °C and -220 °C.', air: 'Rhea has only a super-thin trace of oxygen and carbon dioxide – no air to breathe.' },
    Titan:    { g: 1.35, temp: 'About -179 °C – so cold that methane falls as rain and fills lakes!', air: 'Titan has thick air – about 95% nitrogen and 5% methane, 1.5 times Earth\'s pressure – but no oxygen, so you\'d need an oxygen mask (and a very warm suit).' },
    Iapetus:  { g: 0.223, temp: 'Between about -183 °C and -143 °C (its dark side soaks up more sunlight).', air: 'Iapetus has no air.' },
    Uranus:   { g: 8.87, temp: 'The cloud tops are about -195 °C, and it has the coldest air ever measured on a planet: about -224 °C.', air: 'Uranus is mostly hydrogen and helium with a little methane, which makes it blue-green – no oxygen.', solid: false, rings: 'Yes! Uranus has 13 known rings – thin, dark and hard to see.' },
    Miranda:  { g: 0.079, temp: 'Super cold: about -187 °C, with no air to keep it warm.', air: 'Miranda has no air.' },
    Ariel:    { g: 0.27, temp: 'Colder than about -190 °C.', air: 'Ariel has no air.' },
    Umbriel:  { g: 0.2, temp: 'Colder than about -190 °C.', air: 'Umbriel has no air.' },
    Titania:  { g: 0.37, temp: 'Super cold: about -200 °C, with no air to keep it warm.', air: 'Titania has no air.' },
    Oberon:   { g: 0.35, temp: 'Super cold: about -200 °C, with no air to keep it warm.', air: 'Oberon has no air.' },
    Neptune:  { g: 11.15, temp: 'The cloud tops are about -200 °C – and its winds are the fastest in the solar system, over 2,000 km/h!', air: 'Neptune is mostly hydrogen and helium with some methane, which helps make it blue – no oxygen.', solid: false, rings: 'Yes! Neptune has 5 main rings – thin, dark and clumpy.' },
    Triton:   { g: 0.78, temp: 'About -235 °C – one of the coldest places ever measured in the solar system.', air: 'Triton has only a super-thin layer of nitrogen with a little methane.' },
    Pluto:    { g: 0.62, temp: 'Super cold: about -225 °C to -240 °C.', air: 'Pluto has a very thin layer of nitrogen, methane and carbon monoxide – no oxygen.' },
    Charon:   { g: 0.29, temp: 'Super cold: about -220 °C, with no air to keep it warm.', air: 'Charon has no air.' }
  };
  // Temperature text for the small moons not in the table, by parent planet.
  var SYS_TEMP = {
    Mars: 'With no air to hold heat it is far below freezing most of the time.',
    Jupiter: 'It is colder than about -100 °C, even in sunshine.',
    Saturn: 'It is colder than about -150 °C.',
    Uranus: 'It is colder than about -180 °C.',
    Neptune: 'It is colder than about -200 °C.',
    Pluto: 'It is colder than about -220 °C.'
  };
  var EXTRA_DAY = {
    Mercury: ' But because it also moves around the Sun, one sunrise to the next takes about 176 Earth days!',
    Venus: ' It spins backwards, and one sunrise to the next takes about 117 Earth days.'
  };

  // ---- data ----
  function list() {
    if (DATA) return DATA;
    try { if (window.SE && SE.getPlanets) { var p = SE.getPlanets(); if (p && p.length) return p; } } catch (e) {}
    return [];
  }
  function body(name) {
    if (!name) return null;
    var n = String(name).trim().toLowerCase();
    var L = list();
    for (var i = 0; i < L.length; i++) if (L[i].name.toLowerCase() === n) return L[i];
    return null;
  }
  var ready = fetch(new URL('planets.json', BASE)).then(function (r) { return r.json(); })
    .then(function (d) { DATA = d; return true; })
    .catch(function (e) { console.warn('[astro] planets.json not loaded', e); return false; });

  // ---- formatting ----
  function num(x, dp) { return Number(x).toLocaleString('en-US', { maximumFractionDigits: dp || 0 }); }
  function big(km) {
    if (km >= 1e9) return num(km / 1e9, 1) + ' billion km';
    if (km >= 1e6) return num(km / 1e6, km >= 1e8 ? 0 : 1) + ' million km';
    return num(km) + ' km';
  }
  function dur(h) {
    if (h < 48) return num(h, h < 10 ? 1 : 0) + ' hours';
    var d = h / 24;
    if (d < 1000) return num(d, d < 10 ? 1 : 0) + ' Earth days';
    return num(d / 365.25, 0) + ' Earth years';
  }
  function yearText(y) {
    if (!y || y.value == null) return null;
    if (y.unit === 'years') return y.value >= 1e6 ? num(y.value / 1e6) + ' million years' : num(y.value, 1) + ' Earth years';
    return dur(y.value * 24);
  }
  function kind(b) {
    if (b.type === 'star') return 'star';
    if (b.type === 'moon') return 'moon';
    if (b.type === 'dwarf planet') return 'dwarf planet';
    return b.subtype || 'planet';
  }
  function isGiant(b) { return /giant/.test(b.subtype || '') || (F[b.name] && F[b.name].solid === false && b.type !== 'star'); }
  function gravity(b) {
    if (F[b.name] && F[b.name].g != null) return F[b.name].g;
    return null; // small moons: < 1% of Earth's
  }
  function sunDistKm(b) {
    if (b.distance_au != null) return b.distance_au * AU_KM;
    var p = b.parent && body(b.parent);
    return p ? sunDistKm(p) : null;
  }
  function children(b) { return list().filter(function (x) { return x.parent === b.name; }); }

  // ---- answer builders, one per intent ----
  var A = {
    size: function (b) {
      var d = b.radius_km * 2, r = b.radius_km / EARTH_R;
      if (b.name === 'Earth') return 'Earth is about 12,742 km wide – that\'s our measuring stick for every other world!';
      if (r >= 1.5) {
        var vol = Math.pow(r, 3);
        return b.name + ' is about ' + num(d) + ' km wide – that\'s about ' + num(r, r < 10 ? 1 : 0) + ' Earths side by side! About ' +
          (vol >= 1e6 ? num(vol / 1e6, 1) + ' million' : num(vol >= 1000 ? Math.round(vol / 10) * 10 : vol)) + ' Earths could fit inside it.';
      }
      if (r >= 0.15) {
        var pct = Math.round(r * 100);
        return b.name + ' is about ' + num(d) + ' km wide – ' + (pct >= 90 ? 'almost the same size as Earth (' + pct + '% as wide).' :
          pct >= 45 && pct <= 55 ? 'about half as wide as Earth.' : 'about ' + pct + '% as wide as Earth.') +
          (b.name !== 'Moon' && b.radius_km < 3000 ? ' Our Moon is ' + num(3474) + ' km wide, for comparison.' : '');
      }
      if (d >= 500) return b.name + ' is about ' + num(d) + ' km wide – about ' + Math.round(d / 3474 * 100) + '% as wide as our Moon, and you could fit about ' + Math.round(12742 / d) + ' of them across Earth.';
      var hrs = d / 5;
      return b.name + ' is only about ' + num(d) + ' km across – tiny! Walking nonstop, you could cross it in about ' +
        (hrs < 48 ? num(hrs) + ' hours.' : num(hrs / 24) + ' days.') + (b.radius_note ? '' : '');
    },
    breathe: function (b) {
      var f = F[b.name];
      if (f && f.breathe) return f.air;
      var air = f ? f.air : b.name + ' has no air at all.';
      return 'No – you\'d need a spacesuit! ' + air;
    },
    hot: function (b) {
      var f = F[b.name];
      if (f && f.temp) return f.temp;
      return (SYS_TEMP[b.parent] || 'It is very, very cold.') + ' Tiny moons like ' + b.name + ' have no air to keep them warm.';
    },
    distance: function (b) {
      if (b.type === 'star') return 'This IS the Sun – everything orbits it! Earth is about 150 million km away, and sunlight takes about 8 minutes 20 seconds to reach us.';
      if (b.distance_au != null) {
        var km = b.distance_au * AU_KM, s = km / 299792.458;
        var t = s < 3600 ? num(s / 60) + ' minutes' : num(s / 3600, 1) + ' hours';
        var cmp = b.name === 'Earth' ? '' : ' That\'s ' + (b.distance_au < 1 ? 'closer than Earth (' + Math.round(b.distance_au * 100) + '% of Earth\'s distance).' : num(b.distance_au, 1) + ' times farther than Earth.');
        return b.name + ' is about ' + big(km) + ' from the Sun on average, and sunlight takes about ' + t + ' to get there.' + cmp;
      }
      var p = body(b.parent), sd = sunDistKm(b);
      return b.name + ' orbits ' + b.parent + ' about ' + big(b.distance_km_from_parent) + ' away' +
        (sd ? ', so it is about as far from the Sun as ' + b.parent + ': roughly ' + big(sd) + '.' : '.');
    },
    day: function (b) {
      var dl = b.day_length || {}, h = b.day_length_hours;
      if (h == null && dl.value != null) h = dl.unit === 'days' ? dl.value * 24 : dl.value;
      if (b.type === 'star') return 'The Sun spins too! Its middle turns once every ' + num(dl.value, 1) + ' Earth days, but near its poles it takes about 35 days – it can do that because it\'s made of gas.';
      if (h == null) return /chaotic/.test(dl.note || '') ? b.name + ' tumbles chaotically, so it has no regular day – you could never predict sunrise!' :
        'Scientists haven\'t measured how fast ' + b.name + ' spins yet – maybe you\'ll find out one day!';
      var s = b.name + ' spins once every ' + dur(h) + (b.name === 'Earth' ? ' – that\'s one day!' : ', compared to 24 hours on Earth.');
      if (/tidally locked/.test(dl.note || '')) s += ' It is tidally locked, so the same side always faces ' + b.parent + '.';
      if (b.retrograde_rotation && b.name !== 'Venus') s += ' It spins backwards compared to most planets!';
      if (b.name === 'Venus' && b.year_length_days) s += ' That\'s even longer than its year!';
      return s + (EXTRA_DAY[b.name] || '');
    },
    year: function (b) {
      var y = yearText(b.year_length);
      if (b.type === 'star') return 'The Sun takes about 230 million years to go once around the center of our Milky Way galaxy!';
      if (!y) return 'Nobody knows that yet!';
      if (b.type === 'moon') return b.name + ' goes around ' + b.parent + ' once every ' + y + '.' + (b.retrograde_orbit ? ' It goes the "wrong" way – backwards!' : '');
      return 'One year on ' + b.name + ' – one trip around the Sun – takes ' + y + (b.name === 'Earth' ? ' (that\'s why a year has 365 days, plus a leap day every 4 years).' : ', compared to 365 days for Earth.');
    },
    moons: function (b) {
      if (b.type === 'star') return 'The Sun has no moons – instead it has 8 planets, plus dwarf planets like Pluto, asteroids and comets going around it!';
      if (b.type === 'moon') { var p = body(b.parent); return b.name + ' is a moon itself! It goes around ' + b.parent + (p && p.moons > 1 ? ', which has ' + num(p.moons) + ' known moons.' : '.'); }
      if (!b.moons) return b.name + ' has no moons at all.';
      var kids = children(b).map(function (x) { return x.name; });
      if (b.moons === 1) return b.name + ' has 1 moon' + (kids.length ? ': ' + kids[0] : '') + '.';
      var named = !kids.length ? '' : b.moons === kids.length ? ': ' + kids.join(' and ') + '.' :
        kids.length === 1 ? ' You can visit ' + kids[0] + ' here.' : ' You can visit ' + kids.length + ' of them here, like ' + kids.slice(0, 4).join(', ') + '.';
      return b.name + ' has ' + num(b.moons) + ' known moons' + (named.charAt(0) === ':' ? named : '!' + named);
    },
    stand: function (b) {
      if (b.type === 'star') return 'No way! The Sun has no solid surface – it\'s all super-hot glowing gas, and you\'d burn up long before getting close.';
      if (isGiant(b)) return 'No – ' + b.name + ' is a ' + kind(b) + ' with no solid surface. You\'d sink through deeper and deeper clouds until the crushing pressure stopped you.';
      if (b.name === 'Earth') return 'Yes – you\'re probably standing on it right now!';
      if (b.name === 'Venus') return 'Yes, it has a rocky surface – but the heat (465 °C) and crushing air pressure would destroy you in minutes. Robot landers only lasted about 2 hours!';
      if (b.name === 'Moon') return 'Yes! 12 astronauts walked on the Moon between 1969 and 1972 – you can land there too!';
      if (b.name === 'Io') return 'Yes, but watch out – Io is the most volcanic world in the solar system, with hundreds of volcanoes!';
      if (b.name === 'Titan') return 'Yes! Titan has a solid icy surface with dunes and methane lakes. With thick air and weak gravity, you could even fly by flapping wings strapped to your arms!';
      var g = gravity(b);
      if (g != null && g < 0.3 || g == null) return 'Yes, it\'s solid – but gravity is so weak that one jump would send you floating up very high, and you\'d drift back down very slowly.';
      return 'Yes! ' + b.name + ' has a solid surface you could stand on – in a spacesuit. Try pressing Land to see it!';
    },
    weigh: function (b) {
      var g = gravity(b);
      if (g == null) return 'Almost nothing! Gravity on ' + b.name + ' is less than 1% of Earth\'s, so a ' + KID_KG + ' kg kid would weigh less than 0.3 kg there – about as much as an apple.';
      var r = g / EARTH_G, kg = KID_KG * r;
      if (b.name === 'Earth') return 'On Earth you weigh exactly what you weigh – it\'s our measuring stick! Gravity here is 9.8 m/s².';
      var pre = b.type === 'star' ? 'You couldn\'t stand there, but if you could: ' : isGiant(b) ? 'There\'s no ground, but floating at the cloud tops: ' : '';
      var cmp = r >= 1.05 ? num(r, 1) + ' times your Earth weight' : r >= 0.95 ? 'about the same as on Earth' : 'about ' + (r < 0.01 ? num(r * 100, 2) : r < 0.1 ? num(r * 100, 1) : num(r * 100)) + '% of your Earth weight';
      return pre + (pre ? 'you' : 'You') + '\'d weigh ' + cmp + ' – a ' + KID_KG + ' kg kid would feel like ' + (kg < 0.1 ? 'less than 0.1 kg' : kg < 1 ? num(kg, 1) + ' kg' : num(kg) + ' kg') + (r < 0.3 ? ', so you could jump super high!' : r > 1.5 ? ' and could barely lift their arms!' : '.');
    },
    fun: function (b) { return b.fact || ('Fun fact: ' + b.name + ' is a ' + kind(b) + ' in our solar system!'); },
    orbit: function (b) {
      if (b.type === 'star') return 'The Sun orbits the center of the Milky Way galaxy, taking about 230 million years for one lap.';
      if (b.parent) return b.name + ' orbits ' + b.parent + ', about ' + big(b.distance_km_from_parent) + ' away, going around once every ' + yearText(b.year_length) + '.';
      return b.name + ' orbits the Sun, about ' + big(b.distance_au * AU_KM) + ' away.';
    },
    rings: function (b) {
      var f = F[b.name];
      if (f && f.rings) return f.rings;
      return 'No, ' + b.name + ' doesn\'t have rings. In our solar system, Jupiter, Saturn, Uranus and Neptune all have rings – but Saturn\'s are the famous bright ones.';
    },
    what: function (b) {
      var k = kind(b);
      if (b.type === 'star') return 'The Sun is a star – a giant ball of hot glowing gas that gives us light and warmth. It\'s the center of our solar system!';
      if (b.type === 'moon') return b.name + ' is a moon of ' + b.parent + '.' + (b.irregular ? ' It\'s a far-out "irregular" moon, probably a captured space rock.' : '');
      if (b.type === 'dwarf planet') return 'Pluto is a dwarf planet in the icy Kuiper Belt, far beyond Neptune. It was called the ninth planet until 2006.';
      return b.name + ' is a ' + k + (k === 'terrestrial' ? ' (rocky) planet.' : ' planet, mostly made of gas and liquid with no solid ground.');
    }
  };

  // Suggested-question text -> intent
  var Q = {
    size: 'How big is it?', breathe: 'Can I breathe here?', hot: 'How hot is it?', distance: 'How far from the Sun?',
    day: 'How long is a day?', year: 'How long is a year?', moons: 'How many moons?', stand: 'Could I stand on it?',
    weigh: 'How much would I weigh?', fun: 'Fun fact!', orbit: 'What does it orbit?', rings: 'Does it have rings?', what: 'What is it?'
  };
  // keyword rules for typed questions (first match wins; order matters)
  var RULES = [
    ['fun', /\bfun\b|\bfact|\bcool\b|tell me (something|about)|interesting|surprise/],
    ['breathe', /breath|\bair\b|oxygen|atmospher|\bgas(es)?\b.*(air|made)|suffocat|helmet|space ?suit/],
    ['weigh', /weigh|weight|gravity|jump|heav(y|ier)|light(er)?\b(?! ?years?|( ?\w+){0,2} (take|travel|get|reach))|pull/],
    ['stand', /stand|walk|land(ing)?\b|surface|solid|ground|step|visit|live (on|there)|go there/],
    ['hot', /hot|cold|temp|warm|freez|heat|degree|chilly|burn|weather/],
    ['rings', /ring/],
    ['moons', /moons\b|how many moon|any moon|\ba moon\b|satellite/],   // plain "moon" is a body name ("how far is the moon")
    ['orbit', /orbit|go(es)? around|circle|parent|belong/],
    ['year', /\byear|birthday|around the sun/],
    ['day', /\bday|spin|rotat|night|sunrise|sunset|hours?\b/],
    ['distance', /far|distance|close|near|away|light ?(take|travel)|how long (does it take )?to (get|travel|fly)|take to get/],
    ['size', /big|size|large|small|wide|width|diameter|radius|huge|tiny|giant/],
    ['what', /what (is|kind|type)|made of|planet\??$|star\??$/]
  ];

  function intentOf(q) {
    if (!q) return null;
    var s = String(q).trim();
    for (var k in Q) if (Q[k].toLowerCase() === s.toLowerCase()) return k;
    var t = s.toLowerCase();
    for (var i = 0; i < RULES.length; i++) if (RULES[i][1].test(t)) return RULES[i][0];
    return null;
  }

  function questions(name) {
    var b = body(name);
    if (!b) return [Q.size, Q.hot, Q.distance, Q.fun];
    var out = ['size', 'breathe', 'hot', 'distance', 'day', 'moons', 'stand', 'weigh', 'fun'];
    if (b.type === 'moon') out.splice(5, 1, 'orbit');           // "What does it orbit?" instead of "How many moons?"
    if (b.type !== 'star' && b.type !== 'moon') out.splice(5, 0, 'year');
    if (isGiant(b)) out.splice(out.length - 1, 0, 'rings');
    return out.map(function (k) { return Q[k]; });
  }

  function notReady(name) {
    return list().length ? 'Hmm, I don\'t know a place called "' + name + '" yet. Try picking a planet or moon!' :
      'I\'m still loading my star charts – ask me again in a second!';
  }

  function answer(name, question) {
    var b = body(name);
    if (!b) return notReady(name);
    var k = intentOf(question);
    if (!k) return fallback(b);
    try { return polish(A[k](b)); } catch (e) { console.warn('[astro]', e); return fallback(b); }
  }

  // "Sun"/"Moon" are names that need "the" in a sentence.
  function polish(t) {
    return String(t).replace(/(^|[^A-Za-z])(the |The |our |Our )?(Sun|Moon)\b/g, function (m, pre, art, w) { return pre + (art || 'the ') + w; })
      .replace(/(^|[.!?] +)the /g, function (m, p) { return p + 'The '; });
  }
  function fallback(b) {
    var qs = questions(b.name).slice(0, 3).map(function (q) { return '"' + q + '"'; });
    return 'I\'m not sure about that one! Try asking ' + qs.slice(0, -1).join(', ') + ' or ' + qs[qs.length - 1] + '.';
  }

  // Free-text: may mention a different body ("how hot is mars?") – answer about that one.
  function ask(name, text) {
    var t = String(text || '').toLowerCase(), target = body(name), L = list(), best = null;
    for (var i = 0; i < L.length; i++) {
      var n = L[i].name.toLowerCase();
      // the first body mentioned is the subject ("is mars bigger than earth?" -> Mars)
      var m = new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').exec(t);
      if (m && (!best || m.index < best.i || (m.index === best.i && n.length > best.b.name.length))) best = { b: L[i], i: m.index };
    }
    best = best && best.b;
    if (best && !(best.name === 'Moon' && target && target.type === 'moon')) target = best;
    if (!target) return notReady(name);
    if (/^\s*(hi|hello|hey|yo|g'?day)\b/.test(t) && !intentOf(t.replace(/^\s*\S+/, ''))) return 'Hi there, space explorer! Ask me anything about ' + target.name + ' – like "' + questions(target.name)[0] + '"';
    if (!intentOf(t)) return fallback(target);
    return answer(target.name, t);
  }

  // ---- speech ----
  var ROBOT = /espeak|zarvox|trinoid|albert|bad news|good news|bahh|bells|boing|bubbles|cellos|wobble|whisper|jester|organ|superstar|hysterical|deranged|novelty|fred|ralph|junior|kathy|grandma|grandpa|rocko|shelley|eddy|flo|reed|sandy/i;
  var NICE = /natural|neural|enhanced|premium|google|samantha|karen|catherine|lee|ava|allison|susan|zira|aria|jenny|guy/i;
  var voice = null;
  function pickVoice() {
    var vs = [];
    try { vs = speechSynthesis.getVoices() || []; } catch (e) {}
    if (!vs.length) return null;
    function score(v) {
      var l = (v.lang || '').replace('_', '-').toLowerCase(), s = 0;
      if (l === 'en-au') s += 30; else if (l === 'en-us') s += 25; else if (l === 'en-gb') s += 15; else if (l.indexOf('en') === 0) s += 10; else return -1;
      if (ROBOT.test(v.name)) s -= 100;
      if (NICE.test(v.name)) s += 12;
      if (v.localService) s += 3; // works offline
      if (v.default) s += 1;
      return s;
    }
    var best = null, bs = -1e9;
    vs.forEach(function (v) { var s = score(v); if (s > bs) { bs = s; best = v; } });
    return bs >= 0 ? best : null;
  }
  function supported() { return typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined'; }
  if (supported()) {
    try { voice = pickVoice(); speechSynthesis.addEventListener('voiceschanged', function () { voice = pickVoice(); }); } catch (e) {}
  }
  function emit(type, text) { try { window.dispatchEvent(new CustomEvent(type, { detail: { text: text } })); } catch (e) {} }
  var current = null;
  function speak(text) {
    if (!supported() || !text) return null;
    try {
      speechSynthesis.cancel();
      var clean = String(text).replace(/°C/g, ' degrees Celsius').replace(/km\/h/g, 'kilometres per hour').replace(/(\d) ?km\b/g, '$1 kilometres')
        .replace(/m\/s²/g, 'metres per second squared').replace(/(\d)% /g, '$1 percent ').replace(/(\d)%/g, '$1 percent').replace(/–/g, ',');
      var u = new SpeechSynthesisUtterance(clean);
      if (!voice) voice = pickVoice();
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-US';
      u.rate = 1; u.pitch = 1; u.volume = 1;
      var done = false, fin = function () { if (done) return; done = true; if (current === u) current = null; emit('astro:done', text); };
      u.onstart = function () { emit('astro:speaking', text); };
      u.onend = fin; u.onerror = fin;
      current = u;
      speechSynthesis.speak(u);
      return u;
    } catch (e) { return null; }
  }
  function stop() { if (supported()) try { speechSynthesis.cancel(); } catch (e) {} }

  window.ASTRO = { questions: questions, answer: answer, ask: ask, speak: speak, stop: stop, ready: ready,
    bodies: function () { return list().map(function (b) { return b.name; }); }, _intent: intentOf };
})();
