// App Mac de Quotidien : la même app web, dans une vraie fenêtre, avec
//   - une icône dans la barre des menus (chrono en cours) ;
//   - un widget de bureau flottant (fenêtre « widget ») ;
//   - une vue rapide ouverte par ⌥ Espace depuis n'importe quelle app (fenêtre « quick ») ;
//   - le lancement au démarrage et les notifications.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, RunEvent, WindowEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

fn show_window(app: &AppHandle, label: &str) {
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn show_main(app: AppHandle) {
    show_window(&app, "main");
}

// Texte à côté de l'icône dans la barre des menus (ex. le chrono « 1:42 »).
#[tauri::command]
fn set_tray_title(app: AppHandle, title: String) {
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_title(if title.is_empty() { None } else { Some(title) });
    }
}

// Affiche ou masque le widget ou l'île (réglages de l'app).
#[tauri::command]
fn set_window(app: AppHandle, label: String, visible: bool) {
    if !["widget", "island"].contains(&label.as_str()) {
        return;
    }
    if let Some(w) = app.get_webview_window(&label) {
        let _ = if visible { w.show() } else { w.hide() };
    }
}

// Taille de l'île selon son état ; elle reste centrée juste sous la barre des menus.
#[tauri::command]
fn island_frame(app: AppHandle, w: f64, h: f64) {
    if let Some(win) = app.get_webview_window("island") {
        if let Ok(Some(m)) = win.primary_monitor() {
            let s = m.scale_factor();
            let area = m.work_area();
            let x = area.position.x as f64 / s + (area.size.width as f64 / s - w) / 2.0;
            let y = area.position.y as f64 / s + 6.0;
            let _ = win.set_size(LogicalSize::new(w, h));
            let _ = win.set_position(LogicalPosition::new(x, y));
        }
    }
}

fn toggle_window(app: &AppHandle, label: &str) {
    if let Some(w) = app.get_webview_window(label) {
        let _ = if w.is_visible().unwrap_or(false) { w.hide() } else { w.show() };
    }
}

fn toggle_quick(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("quick") {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            let _ = w.center();
            show_window(app, "quick");
        }
    }
}

// Widget en bas à droite de l'écran principal.
fn place_widget(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("widget") {
        if let Ok(Some(m)) = w.primary_monitor() {
            let scale = m.scale_factor();
            let size = m.size().to_logical::<f64>(scale);
            let _ = w.set_position(LogicalPosition::new(size.width - 310.0 - 24.0, size.height - 236.0 - 96.0));
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let quick_shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut == &quick_shortcut && event.state() == ShortcutState::Pressed {
                        toggle_quick(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![show_main, set_tray_title, set_window, island_frame])
        .setup(move |app| {
            let _ = app.global_shortcut().register(quick_shortcut);
            place_widget(app.handle());

            let open = MenuItem::with_id(app, "open", "Ouvrir Quotidien", true, None::<&str>)?;
            let quick = MenuItem::with_id(app, "quick", "Vue rapide (⌥ Espace)", true, None::<&str>)?;
            let widget = MenuItem::with_id(app, "widget", "Afficher / masquer le widget", true, None::<&str>)?;
            let island = MenuItem::with_id(app, "island", "Afficher / masquer l'île", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quitter Quotidien", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quick, &widget, &island, &sep, &quit])?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Quotidien")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_window(app, "main"),
                    "quick" => toggle_quick(app),
                    "widget" => toggle_window(app, "widget"),
                    "island" => toggle_window(app, "island"),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        show_window(tray.app_handle(), "main");
                    }
                })
                .build(app)?;
            Ok(())
        })
        // fermer une fenêtre la cache seulement : l'app reste dans la barre des menus
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("impossible de lancer Quotidien");

    app.run(|app, event| {
        // clic sur l'icône du Dock quand la fenêtre est cachée
        if let RunEvent::Reopen { .. } = event {
            show_window(app, "main");
        }
    });
}
