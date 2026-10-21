#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
    fn SetWindowPos(
        hwnd: *mut std::ffi::c_void,
        insert_after: *mut std::ffi::c_void,
        x: i32,
        y: i32,
        width: i32,
        height: i32,
        flags: u32,
    ) -> i32;
}

/// Update the caller's undecorated window in one physical-pixel operation.
#[tauri::command]
pub async fn set_window_bounds(
    window: tauri::WebviewWindow,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<(), String> {
    if !(1..=16384).contains(&width) || !(1..=16384).contains(&height) {
        return Err("窗口尺寸超出范围".into());
    }

    #[cfg(windows)]
    {
        let target = window.clone();
        let (sender, receiver) = std::sync::mpsc::channel();
        window
            .run_on_main_thread(move || {
                let result = target
                    .hwnd()
                    .map_err(|error| error.to_string())
                    .and_then(|hwnd| {
                        // Preserve z-order/focus. Discard the old client bitmap instead
                        // of copying a stretched/offset frame into the resized window.
                        let flags = 0x0004 | 0x0010 | 0x0100; // NOZORDER | NOACTIVATE | NOCOPYBITS
                        let success = unsafe {
                            SetWindowPos(hwnd.0, std::ptr::null_mut(), x, y, width, height, flags)
                        };
                        if success == 0 {
                            Err(std::io::Error::last_os_error().to_string())
                        } else {
                            Ok(())
                        }
                    });
                let _ = sender.send(result);
            })
            .map_err(|error| error.to_string())?;

        tauri::async_runtime::spawn_blocking(move || {
            receiver.recv().map_err(|error| error.to_string())?
        })
        .await
        .map_err(|error| error.to_string())?
    }

    #[cfg(not(windows))]
    {
        window
            .set_position(tauri::PhysicalPosition::new(x, y))
            .map_err(|error| error.to_string())?;
        window
            .set_size(tauri::PhysicalSize::new(width as u32, height as u32))
            .map_err(|error| error.to_string())
    }
}
