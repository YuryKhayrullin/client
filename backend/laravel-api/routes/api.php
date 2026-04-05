<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    return response()->json([
        'ok' => true,
        'service' => 'xray-client-api'
    ]);
});

Route::get('/config/default', function () {
    return response()->json([
        'inbounds' => [
            [
                'listen' => '127.0.0.1',
                'port' => 10808,
                'protocol' => 'socks'
            ]
        ],
        'outbounds' => []
    ]);
});

Route::post('/config/validate', function (Request $request) {
    $payload = $request->all();
    $valid = isset($payload['outbounds']) && is_array($payload['outbounds']) && count($payload['outbounds']) > 0;

    return response()->json([
        'valid' => $valid,
        'message' => $valid ? 'Config looks valid.' : 'Missing outbounds array.'
    ], $valid ? 200 : 422);
});
