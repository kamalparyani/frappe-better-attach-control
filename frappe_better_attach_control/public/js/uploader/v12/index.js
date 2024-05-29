/*
*  Frappe Better Attach Control © 2024
*  Author:  Ameen Ahmed
*  Company: Level Up Marketing & Software Development Services
*  Licence: Please refer to LICENSE file
*/


import Helpers from './../../utils';
import Filetype from './../../filetypes';


frappe.ui.FileUploader = class FileUploader extends frappe.ui.FileUploader {
    constructor(opts) {
        opts = Helpers.isPlainObject(opts) ? opts : {};
        var extra = opts.extra || {};
        delete opts.extra;
        super(opts);
        if (this.uploader) this._override_uploader(opts, extra);
    }
    _override_uploader(opts, extra) {
        var up = this.uploader,
        me = this;
        up._extra_restrictions = extra;
        up.$watch('show_file_browser', function(show_file_browser) {
            if (!show_file_browser || !up.$refs.file_browser) return;
            me._override_file_browser(
                up.$refs.file_browser,
                !Helpers.isEmpty(opts.restrictions)
                ? opts.restrictions
                : {
                    max_file_size: null,
                    max_number_of_files: null,
                    allowed_file_types: [],
                },
                extra
            );
        });
        if (!Helpers.isEmpty(opts.restrictions)) up.restrictions.as_public = !!opts.restrictions.as_public;
        up.dropfiles = function(e) {
            up.is_dragging = false;
            if (Helpers.isObject(e) && Helpers.isObject(e.dataTransfer))
                up.add_files(e.dataTransfer.files);
        };
        up.check_restrictions = function(file) {
            var max_file_size = up.restrictions.max_file_size,
            {allowed_file_types = [], allowed_filename} = up._extra_restrictions,
            is_correct_type = true,
            valid_file_size = true,
            valid_filename = true;
            if (!Helpers.isEmpty(allowed_file_types))
                is_correct_type = allowed_file_types.some(function(type) {
                    if (Helpers.isRegExp(type)) return file.type && type.test(file.type);
                    if (type.includes('/')) return file.type && file.type === type;
                    if (type[0] === '.') return (file.name || file.file_name).endsWith(type);
                    return false;
                });
            if (max_file_size && file.size != null && file.size)
                valid_file_size = file.size < max_file_size;
            if (allowed_filename) {
                if (Helpers.isRegExp(allowed_filename)) {
                    valid_filename = file.name.match(allowed_filename);
                } else if (!Helpers.isEmpty(allowed_filename)) {
                    valid_filename = allowed_filename === file.name;
                }
            }
            if (!is_correct_type) {
                console.warn('File skipped because of invalid file type', file);
                frappe.show_alert({
                    message: __('File "{0}" was skipped because of invalid file type', [file.name]),
                    indicator: 'orange'
                });
            }
            if (!valid_file_size) {
                console.warn('File skipped because of invalid file size', file.size, file);
                frappe.show_alert({
                    message: __('File "{0}" was skipped because size exceeds {1} MB', [file.name, max_file_size / (1024 * 1024)]),
                    indicator: 'orange'
                });
            }
            if (!valid_filename) {
                console.warn('File skipped because of invalid filename', file, allowed_filename);
                frappe.show_alert({
                    message: __('File "{0}" was skipped because of invalid filename', [file.name]),
                    indicator: 'orange'
                });
            }
            return is_correct_type && valid_file_size && valid_filename;
        };
        up.show_max_files_number_warning = function(file, max_number_of_files) {
            console.warn(
                'File skipped because it exceeds the allowed specified limit of ' + max_number_of_files + ' uploads',
                file
            );
            var MSG;
            if (up.doctype) {
                MSG = __('File "{0}" was skipped because only {1} uploads are allowed for DocType "{2}"',
                    [file.name, max_number_of_files, up.doctype]);
            } else {
                MSG = __('File "{0}" was skipped because only {1} uploads are allowed',
                    [file.name, max_number_of_files]);
            }
            frappe.show_alert({
                message: MSG,
                indicator: "orange",
            });
        };
        up.prepare_files = function(file_array) {
            var is_single = Helpers.isPlainObject(file_array),
            files = is_single ? [file_array] : Array.from(file_array);
            files = files.map(function(f) {
                if (f.name == null) f.name = f.file_name || Filetype.get_filename(f.file_url);
                if (f.type == null) f.type = Filetype.get_file_type(Filetype.get_file_ext(f.file_url)) || '';
                if (f.size == null) f.size = 0;
                return f;
            });
            files = files.filter(up.check_restrictions);
            if (Helpers.isEmpty(files)) return !is_single ? [] : null;
            files = files.map(function(file) {
                var is_image =  file.type.startsWith('image');
                return {
                    file_obj: file,
                    is_image,
                    name: file.name,
                    doc: null,
                    progress: 0,
                    total: 0,
                    failed: false,
                    uploading: false,
                    private: !up.restrictions.as_public || !is_image,
                };
            });
            return !is_single ? files : files[0];
        };
        up.add_files = function(file_array) {
            var files = up.prepare_files(file_array),
            max_number_of_files = up.restrictions.max_number_of_files;
            if (max_number_of_files) {
                var uploaded = (up.files || []).length,
                total = uploaded + files.length;
                if (total > max_number_of_files) {
                    var slice_index = max_number_of_files - uploaded - 1;
                    files.slice(slice_index).forEach(function(file) {
                        up.show_max_files_number_warning(file, max_number_of_files);
                    });
                    files = files.slice(0, max_number_of_files);
                }
            }
            up.files = up.files.concat(files);
        };
        up.upload_via_web_link = function() {
            var file_url = up.$refs.web_link.url;
            if (!file_url) {
                Helpers.error('Invalid URL');
                return Promise.reject();
            }
            file_url = decodeURI(file_url);
            var file = up.prepare_files({file_url});
            return file ? up.upload_file(file) : Promise.reject();
        };
    }
    _override_file_browser(fb, opts, extra) {
        fb._restrictions = opts;
        fb._extra_restrictions = extra;
        fb.check_restrictions = function(file) {
            if (file.is_folder) return true;
            var max_file_size = fb._restrictions.max_file_size,
            {allowed_file_types = [], allowed_filename} = fb._extra_restrictions,
            is_correct_type = true,
            valid_file_size = true,
            valid_filename = true;
            if (!Helpers.isEmpty(allowed_file_types))
                is_correct_type = allowed_file_types.some(function(type) {
                    if (Helpers.isRegExp(type)) return file.type && type.test(file.type);
                    if (type.includes('/')) return file.type && file.type === type;
                    if (type[0] === '.') return (file.name || file.file_name).endsWith(type);
                    return false;
                });
            if (max_file_size && file.size != null && file.size)
                valid_file_size = file.size < max_file_size;
            if (allowed_filename) {
                if (Helpers.isRegExp(allowed_filename)) {
                    valid_filename = file.name.match(allowed_filename);
                } else if (!Helpers.isEmpty(allowed_filename)) {
                    valid_filename = allowed_filename === file.name;
                }
            }
            if (!is_correct_type) {
                console.warn('File skipped because of invalid file type', file);
                frappe.show_alert({
                    message: __('File "{0}" was skipped because of invalid file type', [file.name]),
                    indicator: 'orange'
                });
            }
            if (!valid_file_size) {
                console.warn('File skipped because of invalid file size', file.size, file);
                frappe.show_alert({
                    message: __('File "{0}" was skipped because size exceeds {1} MB', [file.name, max_file_size / (1024 * 1024)]),
                    indicator: 'orange'
                });
            }
            if (!valid_filename) {
                console.warn('File skipped because of invalid filename', file, allowed_filename);
                frappe.show_alert({
                    message: __('File "{0}" was skipped because of invalid filename', [file.name]),
                    indicator: 'orange'
                });
            }
            return is_correct_type && valid_file_size && valid_filename;
        };
        fb.get_files_in_folder = function(folder) {
            return frappe.call(
                'frappe_better_attach_control.api.get_files_in_folder',
                {folder}
            ).then(function(r) {
                var files = r.message || [];
                if (!Helpers.isEmpty(files)) {
                    files = files.map(function(f) {
                        if (f.name == null) f.name = f.file_name || Filetype.get_filename(f.file_url);
                        if (f.type == null) f.type = Filetype.get_file_type(Filetype.get_file_ext(f.file_url)) || '';
                        if (f.size == null) f.size = 0;
                        return f;
                    });
                    files = files.filter(fb.check_restrictions);
                    files.sort(function(a, b) {
                        if (a.is_folder && b.is_folder) {
                            return a.modified < b.modified ? -1 : 1;
                        }
                        if (a.is_folder) return -1;
                        if (b.is_folder) return 1;
                        return 0;
                    });
                    files = files.map(function(file) {
                        var filename = file.file_name || file.name;
                        return {
                            label: frappe.utils.file_name_ellipsis(filename, 40),
                            filename: filename,
                            file_url: file.file_url,
                            value: file.name,
                            is_leaf: !file.is_folder,
                            fetched: !file.is_folder,
                            children: [],
                            open: false,
                            fetching: false,
                            filtered: true
                        };
                    });
                }
                return files;
            });
        };
    }
};