# suffix for source resources (so we get /org/gnome/Maps or
# /org/gnome/Maps/Devel, depending on the profile)
if (get_option('profile') == 'development')
	suffix = '/Devel'
else
	suffix = ''
endif

script_conf = configuration_data()
script_conf.set('GJS', gjs.path())
script_conf.set('PACKAGE_VERSION', version)
script_conf.set('libdir', libdir)
script_conf.set('prefix', prefix)
script_conf.set('suffix', suffix)

configure_file(
	input: 'org.gnome.Maps.in',
	output: app_id,
	configuration: script_conf,
	install: true,
	install_dir: pkgdatadir
)

sources_conf = configuration_data()
sources_conf.set('suffix', suffix)
# comment-out test sources
sources_conf.set('testopencomment', '<!--')
sources_conf.set('testclosecomment', '-->')

gnome.compile_resources(
	app_id + '.src',
	configure_file(
		input: 'org.gnome.Maps.src.gresource.xml.in',
		output: 'org.gnome.Maps.src.gresource.xml',
		configuration: sources_conf
	),
	gresource_bundle: true,
	install: true,
	install_dir: pkgdatadir,
	source_dir: 'geojson-vt'
)
