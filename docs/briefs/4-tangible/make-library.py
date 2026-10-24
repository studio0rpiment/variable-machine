# Brief 4, step 2: the class design library. Four templates a class would write together,
# filled with many small tables, so each row is "data + encoding -> OpenSCAD".
import csv, json, random, sys
random.seed(int(sys.argv[2]) if len(sys.argv) > 2 else 0)
TOPICS = [('rent', 'year', ['2019','2020','2021','2022','2023','2024']), ('rainfall', 'month', ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug']),
          ('riders', 'line', ['Red','Blue','Green','Orange','Silver']), ('trees', 'ward', ['W1','W2','W3','W4','W5','W6','W7','W8']),
          ('visitors', 'day', ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']), ('noise', 'hour', ['6am','9am','12pm','3pm','6pm','9pm'])]
def table(topic, key, labels, n):
    labs = labels[:n]; vals = [random.randint(5, 95) for _ in labs]
    return labs, vals, '\n'.join(f'{l}, {v}' for l, v in zip(labs, vals))
def fmt(vals): return '[' + ', '.join(str(v) for v in vals) + ']'
def bars(topic, key, labs, vals, tbl):
    w = random.choice([8, 10, 12]); g = random.choice([2, 3, 4]); h = random.choice([60, 80, 100])
    enc = random.choice([f'Bars side by side, height = {topic}, {w} mm wide, {g} mm apart, tallest {h} mm.', f'One bar per {key}. Height shows {topic} (tallest bar {h} mm). Bars {w} mm wide with {g} mm gaps.'])
    code = f'''// {topic} by {key}: one bar per {key}, height = {topic}
values = {fmt(vals)};
tallest = {h};  // mm
w = {w}; gap = {g};
scale_h = tallest / max(values);
for (i = [0 : len(values) - 1])
  translate([i * (w + gap), 0, 0]) cube([w, w, values[i] * scale_h]);'''
    return enc, code
def layers(topic, key, labs, vals, tbl):
    d = random.choice([60, 80, 100]); t = random.choice([2, 3, 4])
    enc = random.choice([f'Stacked layers, one per {key}, bottom first. Each layer is a {d} mm disc, {t} mm thick, and its diameter shrinks with {topic}.', f'A stack of {t} mm plates, one for each {key}; plate diameter = {topic} (biggest {d} mm).'])
    code = f'''// {topic} by {key}: one layer per {key}, bottom first; diameter = {topic}
values = {fmt(vals)};
biggest = {d};  // mm
t = {t};  // layer thickness, mm
for (i = [0 : len(values) - 1])
  translate([0, 0, i * t]) cylinder(h = t, d = biggest * values[i] / max(values), $fn = 64);'''
    return enc, code
def radial(topic, key, labs, vals, tbl):
    r = random.choice([40, 50, 60]); h = random.choice([4, 6]); w = random.choice([4, 5, 6])
    enc = random.choice([f'A radial chart: one spoke per {key}, spoke length = {topic} (longest {r} mm), {w} mm wide and {h} mm tall, around a centre.', f'Spokes around a centre, one for each {key}; the longer the spoke, the more {topic}. Longest {r} mm.'])
    code = f'''// {topic} by {key}: one spoke per {key}, length = {topic}
values = {fmt(vals)};
longest = {r};  // mm
w = {w}; h = {h};
cylinder(h = h, d = w * 2, $fn = 32);
for (i = [0 : len(values) - 1])
  rotate([0, 0, i * 360 / len(values)]) translate([0, -w / 2, 0]) cube([longest * values[i] / max(values), w, h]);'''
    return enc, code
def grid(topic, key, labs, vals, tbl):
    c = random.choice([2, 3, 4]); s = random.choice([10, 12, 15]); h = random.choice([40, 60, 80])
    enc = random.choice([f'Columns on a grid, {c} per row, {s} mm square, height = {topic} (tallest {h} mm), on a 2 mm base.', f'A grid of square columns ({s} mm), {c} to a row, standing on a thin base; height shows {topic}, tallest {h} mm.'])
    code = f'''// {topic} by {key}: square columns on a grid, height = {topic}
values = {fmt(vals)};
tallest = {h};  // mm
s = {s}; per_row = {c}; base = 2;
rows = ceil(len(values) / per_row);
cube([per_row * s, rows * s, base]);
for (i = [0 : len(values) - 1])
  translate([(i % per_row) * s, floor(i / per_row) * s, base]) cube([s - 1, s - 1, values[i] * tallest / max(values)]);'''
    return enc, code
out = csv.writer(open(sys.argv[1], 'w', newline='')); out.writerow(['input', 'output'])
n = int(sys.argv[3]) if len(sys.argv) > 3 else 160
for k in range(n):
    topic, key, labels = random.choice(TOPICS); labs, vals, tbl = table(topic, key, labels, random.randint(3, len(labels)))
    enc, code = random.choice([bars, layers, radial, grid])(topic, key, labs, vals, tbl)
    out.writerow([f'Data ({key}, {topic}):\n{tbl}\nEncoding: {enc}\nWrite the OpenSCAD.', code])
