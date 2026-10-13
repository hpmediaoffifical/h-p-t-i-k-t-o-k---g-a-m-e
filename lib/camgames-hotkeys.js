// Thứ tự áp phím tắt khi Game Camera đổi game: game TẮT nhả phím trước, game BẬT đăng ký sau.
// Hai game dùng chung tổ hợp phím (vd Control+Shift+1 cho Đập Muỗi và Họa Sĩ) mà đăng ký trước khi nhả
// thì Electron globalShortcut.register trả false → phím game mới bật chết tới khi lưu lại / khởi động lại.
function hotkeyApplyOrder(changes) {
    const list = Array.isArray(changes) ? changes : [];
    return [...list.filter(c => !c.on), ...list.filter(c => c.on)];
}

module.exports = { hotkeyApplyOrder };
