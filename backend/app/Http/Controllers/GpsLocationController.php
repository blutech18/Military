<?php

namespace App\Http\Controllers;

use App\Models\GpsLocation;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GpsLocationController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(GpsLocation::orderBy('location_name')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'location_name'    => ['required', 'string', 'max:100', 'unique:gps_locations,location_name'],
            'description'      => ['nullable', 'string', 'max:255'],
            'security_level'   => ['required', 'integer', 'between:1,2'],
            'center_latitude'  => ['required', 'numeric', 'between:-90,90'],
            'center_longitude' => ['required', 'numeric', 'between:-180,180'],
            'radius_meters'    => ['required', 'numeric', 'min:1'],
            'is_armory'        => ['nullable', 'boolean'],
            'polygon'          => ['nullable', 'array'],
        ]);

        $loc = GpsLocation::create($data);
        AuditLogger::log('config_change', "Added geofence {$loc->location_name}", $request->user(), request: $request);
        return response()->json($loc, 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $loc  = GpsLocation::findOrFail($id);
        $data = $request->validate([
            'location_name'    => ['sometimes', 'string', 'max:100'],
            'description'      => ['sometimes', 'nullable', 'string', 'max:255'],
            'security_level'   => ['sometimes', 'integer', 'between:1,2'],
            'center_latitude'  => ['sometimes', 'numeric', 'between:-90,90'],
            'center_longitude' => ['sometimes', 'numeric', 'between:-180,180'],
            'radius_meters'    => ['sometimes', 'numeric', 'min:1'],
            'is_armory'        => ['sometimes', 'boolean'],
            'polygon'          => ['sometimes', 'nullable', 'array'],
        ]);

        $loc->update($data);
        AuditLogger::log('config_change', "Updated geofence {$loc->location_name}", $request->user(), request: $request);
        return response()->json($loc);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $loc = GpsLocation::findOrFail($id);
        AuditLogger::log('config_change', "Deleted geofence {$loc->location_name}", $request->user(), request: $request);
        $loc->delete();
        return response()->json(['message' => 'Deleted.']);
    }
}
