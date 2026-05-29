UPDATE settings
SET value = '{"pollIntervalMinutes":15,"defaultLocationId":null,"temperatureUnit":"celsius","windSpeedUnit":"kmh","precipitationUnit":"mm","timeFormat":"system","showAlertsInWidgets":true,"thresholds":{"rainMm":10,"snowCm":5,"windKph":45,"freezeTempC":0,"heatTempC":32}}'
WHERE key = 'weather_settings_json'
  AND value = '{"pollIntervalMinutes":30,"defaultLocationId":null,"temperatureUnit":"celsius","windSpeedUnit":"kmh","precipitationUnit":"mm","timeFormat":"system","showAlertsInWidgets":true,"thresholds":{"rainMm":10,"snowCm":5,"windKph":45,"freezeTempC":0,"heatTempC":32}}';