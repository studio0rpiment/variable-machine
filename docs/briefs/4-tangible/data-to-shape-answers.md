### new: A wavy ribbon: a thin wall 2 mm thick whose height follows rent, 120 mm long, tallest 50 mm.

```
Data (year, rent):
2019, 1200
2020, 1250
2021, 1400
2022, 1600
2023, 1650
Encoding: A wavy ribbon: a thin wall 2 mm thick whose height follows rent, 120 mm long, tallest 50 mm.
Write the OpenSCAD.
```

Answer (renders; size [14, 2, 50] mm; right data):

```openscad
// rent by year: one layer per year, bottom first; height = rent
values = [1200, 1250, 1400, 1600, 1650];
tallest = 50;  // mm
w = 2; gap = 1;
scale_h = tallest / max(values);
for (i = [0 : len(values) - 1])
  translate([i * (w + gap), 0, 0]) cube([w, w, values[i] * scale_h]);
```

### new: A staircase: one step per day, step height = visitors, steps 15 mm deep and 30 mm wide, tallest 60 mm.

```
Data (day, visitors):
Mon, 40
Tue, 55
Wed, 30
Thu, 80
Fri, 95
Encoding: A staircase: one step per day, step height = visitors, steps 15 mm deep and 30 mm wide, tallest 60 mm.
Write the OpenSCAD.
```

Answer (renders; size [195, 15, 60] mm; right data):

```openscad
// visitors by day: one step per day, height = visitors
values = [40, 55, 30, 80, 95];
tallest = 60;  // mm
w = 15; gap = 30;
scale_h = tallest / max(values);
for (i = [0 : len(values) - 1])
  translate([i * (w + gap), 0, 0]) cube([w, w, values[i] * scale_h]);
```

### new: A ring of towers around a circle 80 mm across, tower height = trees, tallest 70 mm.

```
Data (ward, trees):
W1, 300
W2, 120
W3, 450
W4, 210
Encoding: A ring of towers around a circle 80 mm across, tower height = trees, tallest 70 mm.
Write the OpenSCAD.
```

Answer (renders; size [80, 80, 280] mm; right data; 80 x 80 x 280 mm is bigger than the bed):

```openscad
// trees by ward: one layer per ward, bottom first; diameter = trees
values = [300, 120, 450, 210];
biggest = 80;  // mm
t = 70;  // mm
for (i = [0 : len(values) - 1])
  translate([0, 0, i * t]) cylinder(h = t, d = biggest * values[i] / max(values), $fn = 64);
```

### new: A hollow box whose four walls are as tall as the noise at each hour, tallest 50 mm, walls 2 mm thick.

```
Data (hour, noise):
6am, 40
12pm, 70
6pm, 85
12am, 30
Encoding: A hollow box whose four walls are as tall as the noise at each hour, tallest 50 mm, walls 2 mm thick.
Write the OpenSCAD.
```

Answer (renders; size [10, 2, 50] mm; wrong data):

```openscad
// noise by hour: one box per hour, height = noise
values = [40, 70, 85];
tallest = 50;  // mm
w = 2; gap = 2;
scale_h = tallest / max(values);
for (i = [0 : len(values) - 1])
  translate([i * (w + gap), 0, 0]) cube([w, w, values[i] * scale_h]);
```

### library: Bars side by side, height = trees, 10 mm wide, 4 mm apart, tallest 80 mm.

```
Data (ward, trees):
W1, 30
W2, 81
W3, 27
W4, 34
W5, 36
W6, 22
Encoding: Bars side by side, height = trees, 10 mm wide, 4 mm apart, tallest 80 mm.
Write the OpenSCAD.
```

Answer (renders; size [80, 10, 80] mm; right data):

```openscad
// trees by ward: one bar per ward, height = trees
values = [30, 81, 27, 34, 36, 22];
tallest = 80;  // mm
w = 10; gap = 4;
scale_h = tallest / max(values);
for (i = [0 : len(values) - 1])
  translate([i * (w + gap), 0, 0]) cube([w, w, values[i] * scale_h]);
```

### library: A grid of square columns (10 mm), 4 to a row, standing on a thin base; height shows visitors, tallest 40 mm.

```
Data (day, visitors):
Mon, 30
Tue, 58
Wed, 83
Thu, 80
Fri, 32
Sat, 52
Encoding: A grid of square columns (10 mm), 4 to a row, standing on a thin base; height shows visitors, tallest 40 mm.
Write the OpenSCAD.
```

Answer (renders; size [40, 20, 42] mm; wrong data):

```openscad
// visitors by day: square columns on a grid, height = visitors
values = [32, 58, 83, 80, 32, 52];
tallest = 40;  // mm
s = 10; per_row = 4; base = 2;
rows = ceil(len(values) / per_row);
cube([per_row * s, rows * s, base]);
for (i = [0 : len(values) - 1])
  translate([(i % per_row) * s, floor(i / per_row) * s, base]) cube([s - 1, s - 1, values[i] * tallest / max(values)]);
```