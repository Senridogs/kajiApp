# 画面遷移図（Mermaid）

```mermaid
flowchart LR
  n_main_register["繝ｦ繝ｼ繧ｶ繝ｼ逋ｻ骭ｲ"]
  n_main_onboarding["繧ｪ繝ｳ繝懊・繝・ぅ<br/>繝ｳ繧ｰ"]
  n_main_home["繝帙・繝"]
  n_main_calendar_week["繧ｫ繝ｬ繝ｳ繝繝ｼ<br/>・磯ｱ・・]
  n_main_kiroku["縺阪ｍ縺・]
  n_main_monthly_report["譛磯俣繝ｬ繝昴・繝・]
  n_settings_sheet["險ｭ螳咤ottomSh<br/>eet"]
  n_settings_my_report["遘√・繝ｬ繝昴・繝・]
  n_settings_push["繝励ャ繧ｷ繝･騾夂衍<br/>險ｭ螳・]
  n_settings_family["螳ｶ譌上さ繝ｼ繝峨・<br/>諡帛ｾ・]
  n_settings_sleep_mode_like["縺翫ｄ縺吶∩繝｢繝ｼ繝臥ｳｻ繧ｷ繝ｼ繝・br/>・・ame縺ｯsetManage・・]
  n_calendar_month["繧ｫ繝ｬ繝ｳ繝繝ｼ<br/>・域怦陦ｨ遉ｺ・・]
  n_calendar_manage_screen["螳ｶ莠九ｒ邂｡逅・br/>・医き繝ｬ繝ｳ繝繝ｼ蟆守ｷ壼・・・]
  n_sheet_add_chore["螳ｶ莠玖ｿｽ蜉"]
  n_sheet_custom_icon["繧ｫ繧ｹ繧ｿ繝繧｢繧､<br/>繧ｳ繝ｳ"]
  n_sheet_completion_toast["螳御ｺ・ヵ繧｣繝ｼ繝・br/>繝舌ャ繧ｯ"]
  n_sheet_undo_confirm["螳御ｺ・叙繧頑ｶ医＠<br/>遒ｺ隱・]
  n_sheet_history["螻･豁ｴ"]
  n_sheet_edit_chore["螳ｶ莠狗ｷｨ髮・]
  n_sheet_batch_add["螳ｶ莠九∪縺ｨ繧√※<br/>霑ｽ蜉"]
  n_sheet_week_task_reschedule["騾ｱ髢薙ち繧ｹ繧ｯ縺ｮ<br/>譌･縺ｫ縺｡螟画峩"]
  n_sheet_completion_date_setting_a["螳御ｺ・ｮ溽ｸｾ譌･險ｭ<br/>螳哂"]
  n_12["繝輔ャ繧ｿ繝ｼ"]
  n_main_monthly_report --> n_settings_my_report
  n_calendar_month --> n_sheet_week_task_reschedule
  n_calendar_manage_screen --> n_sheet_history
  n_sheet_edit_chore --> n_sheet_custom_icon
  n_main_register --> n_main_onboarding
  n_main_register --> n_main_home
  n_main_home --> n_settings_sheet
  n_main_calendar_week --> n_calendar_month
  n_sheet_week_task_reschedule --> n_sheet_completion_date_setting_a
  n_settings_sheet --> n_settings_family
  n_settings_sheet --> n_settings_push
  n_calendar_manage_screen --> n_sheet_edit_chore
  n_calendar_manage_screen --> n_sheet_edit_chore
  n_calendar_manage_screen --> n_sheet_edit_chore
  n_main_onboarding --> n_sheet_batch_add
  n_settings_sheet --> n_settings_sleep_mode_like
  n_settings_sheet --> n_calendar_manage_screen
  n_sheet_completion_date_setting_a --> n_sheet_completion_toast
  n_main_home --> n_sheet_completion_date_setting_a
  n_main_home --> n_sheet_undo_confirm
  n_12 --> n_main_calendar_week
  n_12 --> n_sheet_add_chore
  n_sheet_add_chore --> n_sheet_custom_icon
  n_12 --> n_main_kiroku
  n_12 --> n_main_monthly_report
  n_calendar_month --> n_calendar_manage_screen
  n_12 --> n_main_home
```
