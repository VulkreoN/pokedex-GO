// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'custom_list.dart';

// **************************************************************************
// TypeAdapterGenerator
// **************************************************************************

class CustomListAdapter extends TypeAdapter<CustomList> {
  @override
  final int typeId = 0;

  @override
  CustomList read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return CustomList(
      name: fields[0] as String,
      description: fields[1] as String?,
      entries: (fields[2] as List?)?.cast<ListEntry>(),
      version: fields[3] as int,
    );
  }

  @override
  void write(BinaryWriter writer, CustomList obj) {
    writer
      ..writeByte(4)
      ..writeByte(0)
      ..write(obj.name)
      ..writeByte(1)
      ..write(obj.description)
      ..writeByte(2)
      ..write(obj.entries)
      ..writeByte(3)
      ..write(obj.version);
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is CustomListAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CustomList _$CustomListFromJson(Map<String, dynamic> json) {
  $checkKeys(
    json,
    requiredKeys: const ['name'],
  );
  return CustomList(
    name: json['name'] as String,
    description: json['description'] as String?,
    entries: (json['entries'] as List<dynamic>?)
            ?.map((e) => ListEntry.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [],
    version: (json['version'] as num?)?.toInt() ?? 1,
  );
}

Map<String, dynamic> _$CustomListToJson(CustomList instance) =>
    <String, dynamic>{
      'name': instance.name,
      'description': instance.description,
      'entries': instance.entries.map((e) => e.toJson()).toList(),
      'version': instance.version,
    };
