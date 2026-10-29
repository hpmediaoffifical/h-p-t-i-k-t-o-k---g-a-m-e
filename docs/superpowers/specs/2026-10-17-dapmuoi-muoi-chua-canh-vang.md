# Đập Muỗi — Muỗi chúa và cánh vàng chuyển động

Tài liệu bàn giao cho Claude triển khai/duy trì phần vẽ muỗi chúa trong `public/games/dapmuoi/overlay.html`.

## 1. Asset và quy ước

- Sprite: `public/games/dapmuoi/assets/muoi-chua-3d.png`.
- Kích thước gốc: `320×200`, PNG RGBA nền trong suốt.
- Sprite chỉ chứa đầu, vương miện, thân, bụng đỏ no máu và chân. **Không nhúng cánh vào sprite**.
- Muỗi chúa dùng logic của muỗi thông minh (`m.smart`): bay, né, đậu, chích và chết như logic hiện có.
- Không vẽ thanh máu, tim, thời gian hoặc thông số riêng.

## 2. Nguyên tắc bắt buộc của gốc cánh

Hai cánh phải dùng **chung một điểm neo trên lưng**:

```js
const QUEEN_PIVOT = {
  x: (150 - 160) / 320,
  y: (80 - 100) / 200
};
```

Điểm neo được biểu diễn tương đối so với tâm sprite. Sau khi canvas đã `translate(m.x, m.y)` và `scale(-m.dir, 1)`, mỗi cánh phải:

1. `ctx.save()`.
2. `ctx.translate(QUEEN_PIVOT.x * w, QUEEN_PIVOT.y * h)`.
3. `ctx.rotate(angle)`.
4. Vẽ đường cánh bắt đầu tại tọa độ cục bộ `(0, -thick × 0.16)` và kết thúc tại `(0, thick × 0.16)`.
5. `ctx.restore()`.

Không xoay một bitmap cánh có `expand: true` rồi đặt lại bằng góc trái bounding box; cách đó làm điểm neo trôi và cánh bị rời khỏi thân.

## 3. Kích thước cánh

```js
const len = w * 0.48;
const thick = h * 0.28;
```

`len` là chiều dài. `thick` là bề ngang cánh muỗi chúa, đã tăng để dễ nhìn trên livestream. Không thay đổi `QUEEN_PIVOT` khi chỉnh kích thước.

## 4. Hình học cánh

```js
ctx.beginPath();
ctx.moveTo(0, -thick * 0.16);
ctx.bezierCurveTo(
  len * 0.20, -thick * 0.72,
  len * 0.63, -thick * 1.08,
  len * 0.88, -thick * 0.70
);
ctx.bezierCurveTo(
  len * 1.04, -thick * 0.46,
  len * 1.04,  thick * 0.34,
  len * 0.88,  thick * 0.58
);
ctx.bezierCurveTo(
  len * 0.58, thick * 0.78,
  len * 0.20, thick * 0.54,
  0, thick * 0.16
);
ctx.closePath();
```

Dáng cánh cần giống muỗi cũ: gốc rộng vừa đủ, bản cánh dài, đầu phải bo tròn, không nhọn.

## 5. Màu và gân cánh

Gradient vàng trong suốt:

```js
const grad = ctx.createLinearGradient(0, 0, len, 0);
grad.addColorStop(0, 'rgba(255,179,0,.82)');
grad.addColorStop(.52, 'rgba(255,221,75,.58)');
grad.addColorStop(1, 'rgba(255,244,170,.18)');
ctx.fillStyle = grad;
ctx.fill();
ctx.lineWidth = 2.6;
ctx.strokeStyle = 'rgba(255,232,105,.98)';
ctx.stroke();
```

Vẽ một gân chính từ gần gốc đến `0.88 × len`, cộng ba gân nhánh. Màu gân: `rgba(193,112,0,.65)`, rộng `1.2`.

## 6. Chuyển động

Khi đang bay:

```js
const flap = Math.sin(m.phase);
drawWing(w, h, (-24 + flap * 32) * Math.PI / 180, 0.98, true);
drawWing(w, h, ( 16 - flap * 30) * Math.PI / 180, 0.82, true);
```

Hai cánh phải dùng dấu ngược nhau để chuyển động lệch pha và đều nhìn thấy. Đầu trái của cả hai cánh luôn đứng yên tại `QUEEN_PIVOT`; chỉ phần cánh phía bên phải chuyển động.

Khi đang đậu/chích:

```js
drawWing(w, h,  6 * Math.PI / 180, 0.70, true);
drawWing(w, h, 20 * Math.PI / 180, 0.56, true);
```

## 7. Thứ tự layer

Vẽ theo đúng thứ tự:

1. Hai cánh vàng.
2. Sprite thân muỗi chúa.
3. Khớp cánh nhỏ nằm trên lưng để che đường nối.
4. Các hiệu ứng trạng thái khác nếu có.

Khớp cánh:

```js
ctx.beginPath();
ctx.ellipse(
  QUEEN_PIVOT.x * w,
  QUEEN_PIVOT.y * h,
  w * 0.027,
  h * 0.045,
  -0.25, 0, Math.PI * 2
);
ctx.fillStyle = '#9b5b08';
ctx.fill();
ctx.lineWidth = 1.5;
ctx.strokeStyle = '#ffd85a';
ctx.stroke();
```

## 8. Chọn sprite và cache

```js
const body = sprite(m.smart ? imgQueen : imgBody, w, h);
```

Cache phải dùng khóa riêng cho muỗi chúa, ví dụ `q${width}x${height}`, để không lấy nhầm bitmap muỗi thường.

## 9. Tiêu chí nghiệm thu

- Hai đầu trái của cánh chạm đúng cùng một khớp trên lưng ở mọi góc vỗ.
- Không có khung hình nào cánh bị trôi hoặc tách khỏi thân.
- Cả hai cánh đều chuyển động rõ; không bị chồng thành một cánh.
- Cánh vàng lớn, đầu bo tròn, có gân và trong suốt.
- Không cắt/khuyết đầu cánh trong asset xem trước; khung preview phải chừa padding đủ cho toàn bộ biên độ vỗ lớn nhất.
- Vương miện, bụng đỏ no máu và chân không bị biến dạng.
- Không xuất hiện thanh máu hoặc HUD riêng cho muỗi chúa.
